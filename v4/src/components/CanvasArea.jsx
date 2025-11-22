import React, { useRef, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export const CanvasArea = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const { canvasObjects, addObject, selectObject, selectedId, updateObject } = useAppStore();
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Cache images to avoid reloading on every render
    const imageCache = useRef({});

    // Handle Drop
    const handleDrop = (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('application/react-dnd');
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (type === 'image') {
            // Sidebar drop
            const newObject = {
                id: Date.now(),
                type: 'image',
                x: x - 50,
                y: y - 50,
                width: 100,
                height: 100,
                rotation: 0,
                src: 'https://via.placeholder.com/150',
                cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0
            };
            addObject(newObject);
        } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            // File drop
            const file = e.dataTransfer.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const newObject = {
                        id: Date.now(),
                        type: 'image',
                        x: x - img.width / 2,
                        y: y - img.height / 2,
                        width: img.width,
                        height: img.height,
                        rotation: 0,
                        src: event.target.result,
                        cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0
                    };
                    addObject(newObject);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDragOver = (e) => e.preventDefault();

    // Selection & Dragging Logic
    const handleMouseDown = (e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Hit testing
        const clickedObject = [...canvasObjects].reverse().find(obj =>
            mouseX >= obj.x && mouseX <= obj.x + obj.width &&
            mouseY >= obj.y && mouseY <= obj.y + obj.height
        );

        if (clickedObject) {
            selectObject(clickedObject.id);
            setIsDragging(true);
            setDragStart({ x: mouseX - clickedObject.x, y: mouseY - clickedObject.y });
        } else {
            selectObject(null);
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging && selectedId) {
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            updateObject(selectedId, {
                x: mouseX - dragStart.x,
                y: mouseY - dragStart.y
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    // Rendering Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const container = containerRef.current;

        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;

        // Clear
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Grid
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
        for (let y = 0; y < canvas.height; y += 50) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
        ctx.stroke();

        // Draw Objects
        canvasObjects.forEach(obj => {
            ctx.save();
            ctx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2);
            ctx.rotate((obj.rotation || 0) * Math.PI / 180);

            if (obj.type === 'image') {
                let img = imageCache.current[obj.src];
                if (!img) {
                    img = new Image();
                    img.src = obj.src;
                    img.onload = () => {
                        // Trigger re-render when loaded
                        // In a real app, we'd use a more robust state update or requestAnimationFrame
                        // For now, we rely on the next update or user interaction
                        // Force update hack or just let it be for next frame
                    };
                    imageCache.current[obj.src] = img;
                }

                if (img.complete && img.naturalWidth !== 0) {
                    // Cropping Logic (Ported from v3)
                    const cropLeft = obj.cropLeft || 0;
                    const cropRight = obj.cropRight || 0;
                    const cropTop = obj.cropTop || 0;
                    const cropBottom = obj.cropBottom || 0;

                    const sWidth = img.naturalWidth - cropLeft - cropRight;
                    const sHeight = img.naturalHeight - cropTop - cropBottom;

                    if (sWidth > 0 && sHeight > 0) {
                        ctx.drawImage(
                            img,
                            cropLeft, cropTop, sWidth, sHeight,
                            -obj.width / 2, -obj.height / 2, obj.width, obj.height
                        );
                    }
                } else {
                    // Placeholder while loading
                    ctx.fillStyle = '#3b82f6';
                    ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
                }
            }

            // Selection
            if (obj.id === selectedId) {
                ctx.strokeStyle = '#0ea5e9';
                ctx.lineWidth = 2;
                ctx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
            }

            ctx.restore();
        });

        // Request animation frame could be used here for smoother updates
    }, [canvasObjects, selectedId]);

    return (
        <div
            ref={containerRef}
            className="flex-1 bg-surface relative overflow-hidden"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <canvas ref={canvasRef} className="block" />
        </div>
    );
};
