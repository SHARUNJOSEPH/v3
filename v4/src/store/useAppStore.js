import { create } from 'zustand';

export const useAppStore = create((set) => ({
    canvasObjects: [],
    selectedId: null,

    // Actions
    addObject: (object) => set((state) => ({
        canvasObjects: [...state.canvasObjects, object],
        selectedId: object.id
    })),

    updateObject: (id, updates) => set((state) => ({
        canvasObjects: state.canvasObjects.map(obj =>
            obj.id === id ? { ...obj, ...updates } : obj
        )
    })),

    removeObject: (id) => set((state) => ({
        canvasObjects: state.canvasObjects.filter(obj => obj.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId
    })),

    selectObject: (id) => set({ selectedId: id }),
}));
