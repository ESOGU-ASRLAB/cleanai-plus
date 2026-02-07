import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as THREE from 'three';
import * as TSP from 'tensorspace';
import $ from 'jquery';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common';
import { FiArrowLeft, FiCpu, FiLayers, FiCalendar, FiTag, FiFileText, FiMaximize2, FiMinimize2, FiHardDrive, FiActivity } from 'react-icons/fi';
import { MainLayout } from '../components/layout';

// Expose THREE and jQuery to window for TensorSpace
window.THREE = THREE;
window.$ = window.jQuery = $;

const Model3DPage = () => {
    const { id, modelId } = useParams();
    const { token } = useAuth();
    const containerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [modelData, setModelData] = useState(null);
    const [layers, setLayers] = useState([]);
    const [error, setError] = useState(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [totalParams, setTotalParams] = useState(0);

    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    useEffect(() => {
        if (layers) {
            const total = layers.reduce((acc, layer) => acc + (layer.params || 0), 0);
            setTotalParams(total);
        }
    }, [layers]);

    useEffect(() => {
        const handleResize = () => {
             // TensorSpace usually listens to window resize logic if set up correctly
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
    };

    // Fetch Data Effect
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch model structure
                const response = await fetch(
                    `http://localhost:8000/api/workspaces/${id}/models/${modelId}/structure`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                if (!response.ok) throw new Error("Failed to fetch model structure");
                const structureData = await response.json();
                setLayers(structureData);

                // Fetch model details for name etc
                const modelRes = await fetch(
                     `http://localhost:8000/api/workspaces/${id}/models/${modelId}`,
                     { headers: { Authorization: `Bearer ${token}` } }
                );
                if (modelRes.ok) {
                    const mData = await modelRes.json();
                    setModelData(mData);
                }

            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id && modelId && token) {
            fetchData();
        }
    }, [id, modelId, token]);

    // TensorSpace Init Effect
    useEffect(() => {
        if (loading || layers.length === 0 || !containerRef.current) return;

        // Clear container
        containerRef.current.innerHTML = '';

        try {
            // Create TensorSpace model
            const modelContainer = containerRef.current;
            const model = new TSP.models.Sequential(modelContainer);

            // Add layers based on fetched structure
            layers.forEach((layer, index) => {
                let shape = [];
                if (typeof layer.shape === 'string') {
                     const matches = layer.shape.match(/(\d+)/g);
                     if (matches) {
                         const dims = matches.map(Number);
                         // If 4 dims [B, C, H, W], take [W, H, C]
                         if (dims.length === 4) {
                             shape = [dims[3], dims[2], dims[1]];
                         } else if (dims.length === 3) {
                             // [C, H, W] -> [W, H, C]
                             shape = [dims[2], dims[1], dims[0]];
                         } else {
                             shape = dims;
                         }
                     }
                }

                const config = {
                    name: layer.name || `layer_${index}`,
                };
                
                if (shape.length > 0) {
                    config.shape = shape;
                }

                // Map layer types
                const type = layer.type.toLowerCase();
                
                if (type.includes('conv')) {
                    model.add(new TSP.layers.Conv2d(config));
                } else if (type.includes('pool')) {
                    model.add(new TSP.layers.Pooling2d(config));
                } else if (type.includes('linear') || type.includes('dense')) {
                    model.add(new TSP.layers.Dense(config));
                } else if (type.includes('flatten')) {
                    model.add(new TSP.layers.Flatten(config));
                } else if (index === 0) {
                     model.add(new TSP.layers.Input1d(config));
                }
            });

            model.init();

        } catch (e) {
            console.error("TensorSpace init error:", e);
        }

    }, [loading, layers, isMaximized]);

    if (loading) {
        return (
            <MainLayout>
                 <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
            </MainLayout>
        );
    }

    if (error) {
        return (
             <MainLayout>
                <div className="text-center py-12">
                    <div className="text-red-500 mb-4">{error}</div>
                    <Link to={`/workspaces/${id}`}>
                         <Button variant="secondary" icon={<FiArrowLeft />}>Back</Button>
                    </Link>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="flex flex-col h-[calc(100vh-100px)]">
                <div className="mb-4 flex justify-between items-center">
                    <div>
                         <div className="flex items-center text-sm text-gray-500 mb-1">
                            <Link to={`/workspaces/${id}`} className="hover:text-primary-600">
                                Workspace
                            </Link>
                            <span className="mx-2">/</span>
                            <span className="text-gray-900 font-medium">3D Architecture</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {modelData?.name} <span className="text-gray-400 font-normal text-lg">3D Visualization</span>
                        </h1>
                    </div>
                     <Link to={`/workspaces/${id}`}>
                        <Button variant="outline" icon={<FiArrowLeft />}>Back to Workspace</Button>
                    </Link>
                </div>
                
                <div className="flex-1 flex gap-6 overflow-hidden">
                    {/* Model Card Sidebar */}
                    <div className={`w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto pr-2 ${isMaximized ? 'hidden' : ''}`}>
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden min-h-[200px]">
                             {modelData ? (
                                <>
                                <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-900 flex items-center">
                                        <FiCpu className="mr-2 text-primary-600" /> Model Details
                                    </h3>
                                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                        modelData.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {modelData.status || 'Ready'}
                                    </span>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Name</div>
                                        <div className="font-medium text-gray-900 break-words">{modelData.name}</div>
                                    </div>
                                    
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Format & Version</div>
                                        <div className="flex gap-2">
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                <FiLayers className="mr-1" /> {modelData.format}
                                            </span>
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                <FiTag className="mr-1" /> v{modelData.version || '1.0'}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Description</div>
                                        <p className="text-sm text-gray-600 leading-snug">
                                            {modelData.description || "No description provided."}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        <div className="bg-gray-50 rounded p-2">
                                            <div className="text-xs text-gray-500 mb-0.5 flex items-center">
                                                <FiHardDrive className="mr-1" /> Size
                                            </div>
                                            <div className="font-semibold text-gray-900">
                                                {formatBytes(modelData.file_size_bytes || 0)}
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 rounded p-2">
                                            <div className="text-xs text-gray-500 mb-0.5 flex items-center">
                                                <FiActivity className="mr-1" /> Params
                                            </div>
                                            <div className="font-semibold text-gray-900">
                                                {totalParams > 0 ? totalParams.toLocaleString() : 'N/A'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <span className="text-gray-500 block">Created</span>
                                            <span className="text-gray-900 font-medium flex items-center mt-0.5">
                                                <FiCalendar className="mr-1" />
                                                {new Date(modelData.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {modelData.updated_at && (
                                            <div>
                                                <span className="text-gray-500 block">Last Updated</span>
                                                <span className="text-gray-900 font-medium flex items-center mt-0.5">
                                                    <FiCalendar className="mr-1" />
                                                    {new Date(modelData.updated_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                </>
                             ) : (
                                <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center h-full">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-3"></div>
                                    <p>Loading model details...</p>
                                </div>
                             )}
                        </div>
                        
                        {/* Layer Summary Card */}
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                                <FiLayers className="mr-2 text-indigo-500" /> Layer Summary
                            </h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
                                <div className="flex justify-between font-medium text-gray-500 pb-1 border-b border-gray-100">
                                    <span>Type</span>
                                    <span>Shape</span>
                                </div>
                                {layers.map((layer, idx) => (
                                    <div key={idx} className="flex justify-between py-1 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                                        <span className="truncate max-w-[120px]" title={layer.type}>{layer.type}</span>
                                        <span className="font-mono text-gray-600">{layer.shape}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 text-xs text-gray-500 text-right">
                                Total Layers: {layers.length}
                            </div>
                        </div>
                    </div>

                    {/* 3D Visualization Area */}
                    <div className={`
                        bg-black overflow-hidden shadow-2xl transition-all duration-300 ease-in-out
                        ${isMaximized 
                            ? 'fixed inset-0 z-[2000] w-screen h-screen m-0 rounded-none border-none' 
                            : 'flex-1 rounded-lg relative border border-gray-800'}
                    `}>
                        <div ref={containerRef} className="w-full h-full" id="tsp-container"></div>
                        
                        {/* Title Overlay when Maximized */}
                        {isMaximized && (
                            <div className="absolute top-4 left-4 bg-gray-900/80 text-white px-4 py-2 rounded backdrop-blur-sm border border-gray-700 pointer-events-none">
                                <h2 className="font-bold text-lg">{modelData?.name}</h2>
                                <p className="text-xs text-gray-400">3D Architecture Visualization</p>
                            </div>
                        )}

                        <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
                           {/* Controls Panel */}
                           <div className="bg-gray-900/80 text-white p-4 rounded backdrop-blur-sm border border-gray-700 max-w-xs transition-opacity hover:opacity-100 opacity-60 pointer-events-auto">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-primary-400">Controls</h3>
                                    <button 
                                        onClick={toggleMaximize}
                                        className="p-1 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
                                        title={isMaximized ? "Minimize" : "Maximize"}
                                    >
                                        {isMaximized ? <FiMinimize2 size={16} /> : <FiMaximize2 size={16} />}
                                    </button>
                                </div>
                                <ul className="text-xs space-y-1 text-gray-300">
                                    <li>• <strong>Left Click + Drag:</strong> Rotate</li>
                                    <li>• <strong>Scroll:</strong> Zoom</li>
                                    <li>• <strong>Click Layer:</strong> View Details</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default Model3DPage;
