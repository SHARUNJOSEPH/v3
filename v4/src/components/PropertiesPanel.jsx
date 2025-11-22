import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Sliders, Move, Maximize, Crop } from 'lucide-react';

const PropertySection = ({ title, icon: Icon, children }) => (
    <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 text-secondary">
            <Icon className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{title}</h3>
        </div>
        <div className="space-y-3">
            {children}
        </div>
    </div>
);

const NumberInput = ({ label, value, onChange }) => (
    <div className="bg-surface rounded-lg p-2 border border-border/50 focus-within:border-primary/50 transition-colors">
        <label className="text-[10px] text-secondary uppercase block mb-1">{label}</label>
        <input
            type="number"
            value={value}
            onChange={onChange}
            className="w-full bg-transparent text-sm text-white font-medium focus:outline-none"
        />
    </div>
);

export const PropertiesPanel = () => {
    const { selectedId, canvasObjects, updateObject } = useAppStore();
    const selectedObject = canvasObjects.find(obj => obj.id === selectedId);

    if (!selectedObject) {
        return (
            <div className="w-80 bg-background/95 backdrop-blur-sm border-l border-border p-6 shrink-0 flex flex-col items-center justify-center text-secondary">
                <Sliders className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">Select an object to edit properties</p>
            </div>
        );
    }

    const handleChange = (key, value) => {
        updateObject(selectedId, { [key]: parseFloat(value) || 0 });
    };

    return (
        <div className="w-80 bg-background/95 backdrop-blur-sm border-l border-border p-6 shrink-0 overflow-y-auto shadow-xl z-20">
            <h2 className="text-xl font-bold mb-8 text-white flex items-center gap-2">
                <span className="w-2 h-8 bg-primary rounded-full"></span>
                Properties
            </h2>

            <PropertySection title="Position" icon={Move}>
                <div className="grid grid-cols-2 gap-3">
                    <NumberInput label="X" value={Math.round(selectedObject.x)} onChange={(e) => handleChange('x', e.target.value)} />
                    <NumberInput label="Y" value={Math.round(selectedObject.y)} onChange={(e) => handleChange('y', e.target.value)} />
                </div>
            </PropertySection>

            <PropertySection title="Dimensions" icon={Maximize}>
                <div className="grid grid-cols-2 gap-3">
                    <NumberInput label="Width" value={Math.round(selectedObject.width)} onChange={(e) => handleChange('width', e.target.value)} />
                    <NumberInput label="Height" value={Math.round(selectedObject.height)} onChange={(e) => handleChange('height', e.target.value)} />
                </div>
            </PropertySection>

            {selectedObject.type === 'image' && (
                <PropertySection title="Cropping" icon={Crop}>
                    <div className="grid grid-cols-2 gap-3">
                        <NumberInput label="Top" value={selectedObject.cropTop || 0} onChange={(e) => handleChange('cropTop', e.target.value)} />
                        <NumberInput label="Bottom" value={selectedObject.cropBottom || 0} onChange={(e) => handleChange('cropBottom', e.target.value)} />
                        <NumberInput label="Left" value={selectedObject.cropLeft || 0} onChange={(e) => handleChange('cropLeft', e.target.value)} />
                        <NumberInput label="Right" value={selectedObject.cropRight || 0} onChange={(e) => handleChange('cropRight', e.target.value)} />
                    </div>
                </PropertySection>
            )}
        </div>
    );
};
