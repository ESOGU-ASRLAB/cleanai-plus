"""
Neuron Coverage-based Importance Module

This module implements a custom importance criterion for torch-pruning
based on neuron coverage metrics computed from calibration data.
"""

import torch
import torch.nn as nn
from typing import Dict, List, Optional
import torch_pruning as tp
from .coverage_analyzer import CoverageAnalyzer


class NeuronCoverageImportance(tp.importance.Importance):
    """
    Importance estimator based on neuron coverage from calibration data.
    
    Channels with higher coverage (more active on test data) are considered
    more important and will be preserved. Channels with lower coverage
    (rarely active) will be pruned first.
    
    This is a data-driven approach that identifies and removes "dead" or
    underutilized neurons based on actual runtime behavior.
    """
    
    def __init__(
        self,
        calibration_inputs: List[torch.Tensor],
        coverage_metric: str = 'normalized_mean',
        epsilon: float = 1e-8
    ):
        """
        Initialize neuron coverage importance estimator.
        
        Args:
            calibration_inputs: List of input tensors for coverage analysis
            coverage_metric: Coverage metric to use:
                - 'normalized_mean': Average activation normalized by global max
                - 'frequency': Proportion of samples where neuron is active
                - 'mean_absolute': Absolute mean activation value
                - 'combined': Weighted combination (0.6*mean + 0.4*frequency)
            epsilon: Small constant to prevent division by zero
        """
        super().__init__()
        
        self.calibration_inputs = calibration_inputs
        self.coverage_metric = coverage_metric
        self.epsilon = epsilon
        
        # Coverage scores will be computed once
        self.coverage_scores: Dict[str, torch.Tensor] = {}
        self._coverage_computed = False
    
    def _ensure_coverage_computed(self, model: nn.Module) -> None:
        """
        Ensure coverage has been computed for the model.
        
        Args:
            model: PyTorch model to analyze
        """
        if self._coverage_computed:
            return
        
        print("\n" + "="*70)
        print("Computing Neuron Coverage for Data-Driven Pruning")
        print("="*70)
        print(f"Coverage Metric: {self.coverage_metric}")
        print(f"Calibration Samples: {len(self.calibration_inputs)}")
        
        # Create a simple dataset wrapper that returns tensors without extra batching
        # Each calibration_input is already [1, C, H, W], so we need to squeeze or concatenate
        class SimpleDataset:
            def __init__(self, inputs):
                # Remove batch dimension from each input since DataLoader will add it back
                self.inputs = [inp.squeeze(0) if inp.dim() == 4 and inp.size(0) == 1 else inp 
                              for inp in inputs]
            
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
        
        # Compute coverage scores
        self.coverage_scores = analyzer.analyze(
            test_loader=loader,
            metric=self.coverage_metric,
            max_batches=None  # Use all calibration samples
        )
        
        # Print statistics
        print("\n" + "-"*70)
        print("Coverage Analysis Results:")
        print("-"*70)
        stats = analyzer.get_coverage_statistics()
        
        total_channels = 0
        total_zero = 0
        
        for layer_name, layer_stats in stats.items():
            print(f"\n{layer_name}:")
            print(f"  Channels: {layer_stats['num_channels']}")
            print(f"  Coverage - Min: {layer_stats['min']:.6f}, "
                  f"Max: {layer_stats['max']:.6f}, "
                  f"Mean: {layer_stats['mean']:.6f}")
            print(f"  Dead neurons (zero coverage): {layer_stats['zero_coverage_count']}")
            
            total_channels += layer_stats['num_channels']
            total_zero += layer_stats['zero_coverage_count']
        
        print("\n" + "-"*70)
        print(f"Total Channels: {total_channels}")
        print(f"Total Dead Neurons: {total_zero} ({total_zero/max(total_channels,1)*100:.1f}%)")
        print("="*70 + "\n")
        
        self._coverage_computed = True
    
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
    
    @torch.no_grad()
    def __call__(self, group: tp.dependency.Group) -> torch.Tensor:
        """
        Compute importance scores for a pruning group based on neuron coverage.
        
        Args:
            group: A torch-pruning dependency group containing layers to prune
            
        Returns:
            1-D tensor of importance scores (one per channel/neuron)
            Higher importance = higher priority to KEEP (not prune)
            Lower importance = will be pruned first
        """
        # Get the model from the dependency graph
        model = group._DG.model
        
        # Ensure coverage has been computed
        self._ensure_coverage_computed(model)
        
        # Get the root layer of the group
        root_dep = group[0][0]  # First dependency in group
        root_module = root_dep.target.module
        root_idxs = group[0][1]  # Indices for this group
        
        # Find module name in the model
        module_name = self._get_module_name(model, root_module)
        
        if module_name is None or module_name not in self.coverage_scores:
            # Fallback: use magnitude-based importance
            print(f"Warning: Coverage not available for module, using magnitude fallback")
            return self._magnitude_fallback(root_module, root_idxs)
        
        # Get coverage scores for this layer
        coverage = self.coverage_scores[module_name]
        
        # Extract scores for the specific indices in this group
        if hasattr(root_idxs[0], 'idx'):
            plain_idxs = [idx.idx for idx in root_idxs]
        else:
            plain_idxs = root_idxs
        
        channel_coverage = coverage[plain_idxs]
        
        # Higher coverage = higher importance = keep (standard torch-pruning convention)
        importance_scores = channel_coverage
        
        # Normalize to [0, 1] range for consistency
        if importance_scores.max() > importance_scores.min() + self.epsilon:
            importance_scores = (importance_scores - importance_scores.min()) / \
                              (importance_scores.max() - importance_scores.min() + self.epsilon)
        
        return importance_scores
    
    def _magnitude_fallback(
        self,
        module: nn.Module,
        idxs: list
    ) -> torch.Tensor:
        """
        Fallback to magnitude-based importance if coverage is unavailable.
        
        Args:
            module: The module to compute importance for
            idxs: Indices of channels to score
            
        Returns:
            Importance scores based on weight magnitude
        """
        # Extract plain indices
        if hasattr(idxs[0], 'idx'):
            plain_idxs = [idx.idx for idx in idxs]
        else:
            plain_idxs = idxs
        
        # Get weight tensor and compute importance based on module type
        if isinstance(module, (nn.Conv2d, nn.Conv1d, nn.Conv3d, nn.ConvTranspose2d)):
            weight = module.weight.data[plain_idxs]
            # L2 norm across all dimensions except output channel
            importance = torch.norm(weight.view(len(plain_idxs), -1), p=2, dim=1)
        
        elif isinstance(module, nn.Linear):
            weight = module.weight.data[plain_idxs]
            importance = torch.norm(weight, p=2, dim=1)
        
        elif isinstance(module, (nn.BatchNorm2d, nn.BatchNorm1d, nn.BatchNorm3d)):
            # For BatchNorm, use gamma (weight) parameter
            if module.weight is not None:
                importance = module.weight.data[plain_idxs].abs()
            else:
                importance = torch.ones(len(plain_idxs))
        
        elif isinstance(module, nn.LayerNorm):
            # LayerNorm weight
            if module.weight is not None:
                importance = module.weight.data[plain_idxs].abs()
            else:
                importance = torch.ones(len(plain_idxs))
        
        else:
            # Default: uniform importance for unknown layer types
            importance = torch.ones(len(plain_idxs))
        
        # Normalize
        if importance.max() > self.epsilon:
            importance = importance / (importance.max() + self.epsilon)
        
        return importance
