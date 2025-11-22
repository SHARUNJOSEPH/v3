import React from 'react';
import { LayoutGrid, Image as ImageIcon, Type, Settings } from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, onDragStart }) => (
    <div
        className="group flex flex-col items-center justify-center p-3 mb-3 rounded-xl cursor-grab transition-all duration-200 hover:bg-surface hover:shadow-lg hover:scale-105 active:scale-95 border border-transparent hover:border-border/50"
        draggable={!!onDragStart}
        onDragStart={onDragStart}
    >
        <div className="p-2 rounded-lg bg-surface group-hover:bg-primary/10 transition-colors">
            <Icon className="w-6 h-6 text-secondary group-hover:text-primary transition-colors" />
        </div>
        <span className="text-[10px] font-medium text-secondary mt-1 group-hover:text-white transition-colors">{label}</span>
    </div>
);

export const Sidebar = () => {
    const handleDragStart = (e, type) => {
        e.dataTransfer.setData('application/react-dnd', type);
    };

    return (
        <div className="w-24 bg-background/95 backdrop-blur-sm border-r border-border flex flex-col p-3 shrink-0 z-20 shadow-xl">
            <div className="mb-8 flex justify-center">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-primary/20">
                    V4
                </div>
            </div>

            <div className="space-y-1">
                <SidebarItem
                    icon={ImageIcon}
                    label="Image"
                    onDragStart={(e) => handleDragStart(e, 'image')}
                />
                <SidebarItem
                    icon={LayoutGrid}
                    label="Grid"
                />
                <SidebarItem
                    icon={Type}
                    label="Text"
                />
            </div>

            <div className="mt-auto">
                <SidebarItem icon={Settings} label="Settings" />
            </div>
        </div>
    );
};
