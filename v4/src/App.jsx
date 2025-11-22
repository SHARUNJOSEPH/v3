import React from 'react';
import { Sidebar } from './components/Sidebar';
import { CanvasArea } from './components/CanvasArea';
import { PropertiesPanel } from './components/PropertiesPanel';

function App() {
  return (
    <div className="flex h-screen w-screen bg-background text-white overflow-hidden">
      <Sidebar />
      <CanvasArea />
      <PropertiesPanel />
    </div>
  );
}

export default App;
