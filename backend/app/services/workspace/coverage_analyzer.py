"""
Neuron Coverage Analyzer Module

Analyzes neural network activation patterns to compute coverage metrics
for use in coverage-based pruning strategies.
"""

import torch
import torch.nn as nn
from typing import Dict, Optional, List, Tuple
from torch.utils.data import DataLoader


class CoverageAnalyzer:
    """
    Analyzes neuron activation coverage on test/validation data.
    
    This class hooks into model layers to track activation patterns
    and compute coverage metrics that can be used for pruning decisions.
    """
    
    def __init__(
        self,
        model: nn.Module,
        device: torch.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    ):
        """
        Initialize coverage analyzer.
        
        Args:
            model: PyTorch model to analyze
            device: Device to run inference on
        """
        self.model = model
        self.device = device
        self.activation_stats: Dict[str, Dict[str, torch.Tensor]] = {}
        self.hooks = []
        
    def _get_hook_fn(self, layer_name: str):
        """
        Create a forward hook function for a specific layer.
        
        Args:
            layer_name: Name of the layer to hook
            
        Returns:
            Hook function that accumulates activation statistics
        """
        def hook(module, input, output):
            """Forward hook to collect activation statistics."""
            # Handle different output shapes
            if isinstance(output, torch.Tensor):
                activations = output.detach()
                
                # Initialize stats dict for this layer if first time
                if layer_name not in self.activation_stats:
                    self.activation_stats[layer_name] = {
                        'sum': None,
                        'sum_abs': None,
                        'max': None,
                        'count': 0,
                        'active_count': None,  # Count of samples where neuron is active
                    }
                
                stats = self.activation_stats[layer_name]
                
                # Compute per-channel statistics
                # Shape: [batch, channels, ...spatial dims...]
                if len(activations.shape) >= 2:
                    # Reduce spatial dimensions, keep batch and channel
                    # For Conv: [B, C, H, W] -> [B, C]
                    # For Linear: [B, features] -> [B, features]
                    if len(activations.shape) > 2:
                        # Spatial dimensions exist (Conv layers)
                        channel_acts = activations.mean(dim=list(range(2, len(activations.shape))))
                    else:
                        # No spatial dims (Linear, BatchNorm1d)
                        channel_acts = activations
                    
                    # Average across batch: [B, C] -> [C]
                    batch_mean = channel_acts.mean(dim=0)
                    batch_abs_mean = channel_acts.abs().mean(dim=0)
                    batch_max = channel_acts.abs().max(dim=0)[0]
                    
                    # Count active neurons (threshold-based, activation > 0.01 of layer max)
                    threshold = batch_max.max() * 0.01
                    active_mask = (channel_acts.abs() > threshold).float().mean(dim=0)
                    
                    # Accumulate statistics
                    if stats['sum'] is None:
                        stats['sum'] = batch_mean.cpu()
                        stats['sum_abs'] = batch_abs_mean.cpu()
                        stats['max'] = batch_max.cpu()
                        stats['active_count'] = active_mask.cpu()
                    else:
                        stats['sum'] += batch_mean.cpu()
                        stats['sum_abs'] += batch_abs_mean.cpu()
                        stats['max'] = torch.maximum(stats['max'], batch_max.cpu())
                        stats['active_count'] += active_mask.cpu()
                    
                    stats['count'] += 1
        
        return hook
    
    def _register_hooks(self):
        """Register forward hooks on all relevant layers."""
        # Hook Conv, Linear, and BatchNorm layers
        target_types = (
            nn.Conv2d, nn.Conv1d, nn.Conv3d,
            nn.Linear,
            nn.BatchNorm1d, nn.BatchNorm2d, nn.BatchNorm3d,
            nn.LayerNorm, nn.GroupNorm,
            nn.ConvTranspose2d
        )
        
        for name, module in self.model.named_modules():
            if isinstance(module, target_types) and name:  # Skip root module
                hook = module.register_forward_hook(self._get_hook_fn(name))
                self.hooks.append(hook)
    
    def _remove_hooks(self):
        """Remove all registered hooks."""
        for hook in self.hooks:
            hook.remove()
        self.hooks.clear()
    
    @torch.no_grad()
    def analyze(
        self,
        test_loader: DataLoader,
        metric: str = 'normalized_mean',
        max_batches: Optional[int] = None
    ) -> Dict[str, torch.Tensor]:
        """
        Analyze model coverage on test data.
        
        Args:
            test_loader: DataLoader with test samples
            metric: Coverage metric to compute:
                - 'normalized_mean': Average activation normalized by layer max
                - 'frequency': Proportion of samples where neuron is active
                - 'mean_absolute': Absolute mean activation value
                - 'combined': Weighted combination of mean and frequency
            max_batches: Maximum batches to process (None = all)
            
        Returns:
            Dictionary mapping layer names to coverage scores (1D tensor per layer)
        """
        self.model.eval()
        self.activation_stats.clear()
        
        # Register hooks
        self._register_hooks()
        
        try:
            # Run inference on test data
            batch_count = 0
            for batch_idx, batch in enumerate(test_loader):
                if max_batches is not None and batch_idx >= max_batches:
                    break
                
                # Handle different batch formats
                if isinstance(batch, (list, tuple)):
                    inputs = batch[0]
                else:
                    inputs = batch
                
                inputs = inputs.to(self.device)
                
                # Forward pass (hooks will collect stats)
                _ = self.model(inputs)
                
                batch_count += 1
            
            # Compute final coverage scores
            coverage_scores = {}
            
            for layer_name, stats in self.activation_stats.items():
                if stats['count'] == 0:
                    continue
                
                # Compute coverage based on selected metric
                if metric == 'normalized_mean':
                    # Average activation normalized by global max
                    mean_act = stats['sum'] / stats['count']
                    max_act = stats['max']
                    coverage = mean_act / (max_act.max() + 1e-8)
                    coverage = coverage.clamp(0, 1)
                
                elif metric == 'frequency':
                    # Proportion of samples where neuron was active
                    coverage = stats['active_count'] / stats['count']
                
                elif metric == 'mean_absolute':
                    # Absolute mean activation
                    coverage = stats['sum_abs'] / stats['count']
                    # Normalize to [0, 1]
                    if coverage.max() > 0:
                        coverage = coverage / coverage.max()
                
                elif metric == 'combined':
                    # Weighted combination: 0.6 * mean + 0.4 * frequency
                    mean_act = stats['sum_abs'] / stats['count']
                    mean_act_norm = mean_act / (mean_act.max() + 1e-8)
                    freq = stats['active_count'] / stats['count']
                    coverage = 0.6 * mean_act_norm + 0.4 * freq
                
                else:
                    raise ValueError(f"Unknown metric: {metric}")
                
                coverage_scores[layer_name] = coverage
            
            return coverage_scores
        
        finally:
            # Always remove hooks
            self._remove_hooks()
    
    def get_coverage_statistics(self) -> Dict[str, Dict[str, float]]:
        """
        Get summary statistics from the last coverage analysis.
        
        Returns:
            Dictionary with statistics per layer
        """
        stats_summary = {}
        
        for layer_name, stats in self.activation_stats.items():
            if stats['count'] == 0:
                continue
            
            mean_act = stats['sum'] / stats['count']
            
            stats_summary[layer_name] = {
                'num_channels': len(mean_act),
                'mean': float(mean_act.mean()),
                'min': float(mean_act.min()),
                'max': float(mean_act.max()),
                'zero_coverage_count': int((mean_act.abs() < 1e-8).sum()),
            }
        
        return stats_summary
