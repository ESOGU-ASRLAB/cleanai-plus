import torchvision.transforms as transforms

def get_cifar10_resnet_transforms(is_training=True, use_pretrained=True):
    """
    Returns the appropriate transforms for training ResNet-18 on CIFAR-10.
    
    Args:
        is_training (bool): Whether to apply data augmentation (RandomCrop, Flip).
        use_pretrained (bool): If True, resizes images to 224x224 and uses ImageNet normalization
                               (Required for torchvision.models.resnet18(weights=DEFAULT)).
                               If False, keeps 32x32 and uses CIFAR-10 normalization
                               (Suitable for ResNet modified for small inputs).
    """
    
    if use_pretrained:
        # Standard ImageNet normalization
        mean = [0.485, 0.456, 0.406]
        std = [0.229, 0.224, 0.225]
        model_input_size = 224
    else:
        # CIFAR-10 normalization
        mean = [0.4914, 0.4822, 0.4465]
        std = [0.2023, 0.1994, 0.2010]
        model_input_size = 32

    if is_training:
        if use_pretrained:
            # Pretrained: Upsample + Augmentation
            # Typically RandomResizedCrop is used for ImageNet transfer
            return transforms.Compose([
                transforms.RandomResizedCrop(model_input_size), # Or Resize(256) + RandomCrop(224)
                transforms.RandomHorizontalFlip(),
                transforms.ToTensor(),
                transforms.Normalize(mean, std)
            ])
        else:
            # Scratch (Small Input): Standard CIFAR Augmentation
            return transforms.Compose([
                transforms.RandomCrop(model_input_size, padding=4),
                transforms.RandomHorizontalFlip(),
                transforms.ToTensor(),
                transforms.Normalize(mean, std)
            ])
    else:
        # Validation / Test
        t_list = []
        if use_pretrained:
             t_list.append(transforms.Resize(256))
             t_list.append(transforms.CenterCrop(model_input_size))
        
        t_list.append(transforms.ToTensor())
        t_list.append(transforms.Normalize(mean, std))
        
        return transforms.Compose(t_list)

# Example usage string for UI copy-paste
EXAMPLE_UI_CODE = """
import torchvision.transforms as transforms

# Preprocessing for Pre-trained ResNet-18
transform = transforms.Compose([
    transforms.Resize(224),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])
"""
