"""
WANDA (Pruning by Weights AND Activations) Importance Module

This module implements the WANDA importance criterion which combines
weight magnitude with activation magnitude for effective pruning without gradients.
"""

import torch
import torch.nn as nn
from typing import Dict, List, Optional
import torch_pruning as tp
from .coverage_analyzer import CoverageAnalyzer


class WandaImportance(tp.importance.Importance):
    """
    WANDA (Pruning by Weights AND Activations) Importance Estimator.
    
    This method combines weight magnitude with activation magnitude to compute
    importance scores. It's particularly effective for training-free pruning.
    
    Reference: "A Simple and Effective Pruning Approach for Large Language Models"
    Sun et al., 2023 - https://arxiv.org/abs/2306.11695
    
    Formula: Importance = |Weight| × |Activation|
    
    Key Benefits:
    - Training-free (no gradients needed)
    - Fast one-shot pruning
    - Better than magnitude-only or activation-only methods
    - Effective for both CNNs and LLMs
    """
    
    def __init__(
        self,
        calibration_inputs: List[torch.Tensor],
        weight_norm: str = 'l2',
        epsilon: float = 1e-8
    ):
        """
        Initialize WANDA importance estimator.
        
        Args:
            calibration_inputs: List of input tensors for activation analysis
            weight_norm: Norm to use for weight magnitude ('l1' or 'l2')
            epsilon: Small constant to prevent division by zero
        """
        super().__init__()
        
        self.calibration_inputs = calibration_inputs
        self.weight_norm = weight_norm
        self.epsilon = epsilon
        
        # Activation scores computed from calibration data
        self.activation_scores: Dict[str, torch.Tensor] = {}
        self._activations_computed = False
    
    def _ensure_activations_computed(self, model: nn.Module) -> None:
        """
        Ensure activations have been computed for the model.
        
        Args:
            model: PyTorch model to analyze
        """
        if self._activations_computed:
            return
        
        print("\n" + "="*70)
        print("WANDA: Computing Weight × Activation Importance Scores")
        print("="*70)
        print(f"Weight Norm: {self.weight_norm.upper()}")
        print(f"Calibration Samples: {len(self.calibration_inputs)}")
        
        # Create a simple dataset wrapper
        class SimpleDataset:
            def __init__(self, inputs):
                self.inputs = inputs
            
            def __len__(self):
                return len(self.inputs)
            
            def __getitem__(self, idx):
                return self.inputs[idx]
        
        from torch.utils.data import DataLoader
        dataset = SimpleDataset(self.calibration_inputs)
        loader = DataLoader(dataset, batch_size=1, shuffle=False)
        
        # Initialize analyzer
        device = next(model.parameters()).device
        analyzer = CoverageAnalyzer(model, device)
        
        # Compute activation scores using mean absolute metric
        self.activation_scores = analyzer.analyze(
            test_loader=loader,
            metric='mean_absolute',
            max_batches=None
        )
        
        # Print statistics
        print("\n" + "-"*70)
        print("Activation Analysis Results:")
        print("-"*70)
        stats = analyzer.get_coverage_statistics()
        
        total_channels = 0
        total_zero = 0
        
        for layer_name, layer_stats in stats.items():
            print(f"\n{layer_name}:")
            print(f"  Channels: {layer_stats['num_channels']}")
            print(f"  Activation - Min: {layer_stats['min']:.6f}, "
                  f"Max: {layer_stats['max']:.6f}, "
                  f"Mean: {layer_stats['mean']:.6f}")
            print(f"  Zero-activation channels: {layer_stats['zero_coverage_count']}")
            
            total_channels += layer_stats['num_channels']
            total_zero += layer_stats['zero_coverage_count']
        
        print("\n" + "-"*70)
        print(f"Total Channels: {total_channels}")
        print(f"Zero-activation Channels: {total_zero} ({total_zero/max(total_channels,1)*100:.1f}%)")
        print("="*70 + "\n")
        
        self._activations_computed = True
    
    def _get_module_name(self, model: nn.Module, target_module: nn.Module) -> Optional[str]:
        """
        Find the name of a module in the model.
        
        Args:
            model: The model containing the module
            target_module: The module to find
            
        Returns:
            Module name or None if not found
        """
        for name, module in model.named_modules():
            if module is target_module:
                return name
        return None
    
    def _compute_weight_importance(
        self,
        module: nn.Module,
        idxs: list
    ) -> torch.Tensor:
        """
        Compute weight magnitude importance for given channels/neurons.
        
        Args:
            module: The module to compute importance for
            idxs: Indices of channels/neurons to score
            
        Returns:
            Weight magnitude scores
        """
        # Extract plain indices
        if hasattr(idxs[0], 'idx'):
            plain_idxs = [idx.idx for idx in idxs]
        else:
            plain_idxs = idxs
        
        # Compute weight magnitude based on module type
        if isinstance(module, (nn.Conv2d, nn.Conv1d, nn.Conv3d, nn.ConvTranspose2d)):
            weight = module.weight.data[plain_idxs]
            # Flatten all dimensions except the channel dimension
            channel_weights = weight.view(len(plain_idxs), -1)
            
        elif isinstance(module, nn.Linear):
            weight = module.weight.data[plain_idxs]
            channel_weights = weight
            
        elif isinstance(module, (nn.BatchNorm2d, nn.BatchNorm1d, nn.BatchNorm3d)):
            # For BatchNorm, use gamma (weight) parameter
            if module.weight is not None:
                weight_scores = module.weight.data[plain_idxs].abs()
                return weight_scores
            else:
                return torch.ones(len(plain_idxs))
        
        elif isinstance(module, nn.LayerNorm):
            # LayerNorm weight
            if module.weight is not None:
                weight_scores = module.weight.data[plain_idxs].abs()
                return weight_scores
            else:
                return torch.ones(len(plain_idxs))
        
        elif isinstance(module, nn.GroupNorm):
            # GroupNorm weight
            if module.weight is not None:
                weight_scores = module.weight.data[plain_idxs].abs()
                return weight_scores
            else:
                return torch.ones(len(plain_idxs))
        
        else:
            # Unsupported layer type, return uniform scores
            return torch.ones(len(plain_idxs))
        
        # Compute weight magnitude using specified norm
        if self.weight_norm == 'l1':
            weight_scores = channel_weights.abs().mean(dim=1)
        elif self.weight_norm == 'l2':
            weight_scores = torch.norm(channel_weights, p=2, dim=1)
        else:
            weight_scores = torch.norm(channel_weights, p=2, dim=1)
        
        return weight_scores
    
    @torch.no_grad()
    def __call__(self, group: tp.dependency.Group) -> torch.Tensor:
        """
        Compute WANDA importance scores: |Weight| × |Activation|
        
        Args:
            group: A torch-pruning dependency group
            
        Returns:
            1-D tensor of importance scores (one per channel/neuron)
            Higher importance = higher priority to KEEP (not prune)
            Lower importance = will be pruned first
        """
        # Get the model from the dependency graph
        model = group._DG.model
        
        # Ensure activations have been computed
        self._ensure_activations_computed(model)
        
        # Get the root layer of the group
        root_dep = group[0][0]
        root_module = root_dep.target.module
        root_idxs = group[0][1]
        
        # Find module name in the model
        module_name = self._get_module_name(model, root_module)
        
        # Get weight scores
        weight_scores = self._compute_weight_importance(root_module, root_idxs)
        
        if module_name is None or module_name not in self.activation_scores:
            # No activation data available, fallback to weight-only
            print(f"Warning: No activation data for layer, using weight-only fallback")
            importance_scores = weight_scores
        else:
            # Get activation scores
            activation_scores = self.activation_scores[module_name]
            
            # Extract indices
            if hasattr(root_idxs[0], 'idx'):
                plain_idxs = [idx.idx for idx in root_idxs]
            else:
                plain_idxs = root_idxs
            
            channel_activations = activation_scores[plain_idxs]
            
            # Ensure both tensors are on the same device
            channel_activations = channel_activations.to(weight_scores.device)
            
            # WANDA: Multiply weight magnitude with activation magnitude
            # Higher score = more important = keep
            importance_scores = weight_scores * channel_activations
        
        # Normalize to [0, 1] range for consistency
        if importance_scores.max() > importance_scores.min() + self.epsilon:
            importance_scores = (importance_scores - importance_scores.min()) / \
                              (importance_scores.max() - importance_scores.min() + self.epsilon)
        
        return importance_scores
