import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useState, useCallback } from 'react'
import FlowCanvas from './components/canvas/FlowCanvas'
import Sidebar from './components/sidebar/Sidebar'
import PropertyPanel from './components/panels/PropertyPanel'
import TopBar from './components/ui/TopBar'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const handleDragEnd = useCallback(() => {
    // handled by onConnect in ReactFlow
  }, [])

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--flow-bg)]">
        <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-1 overflow-hidden">
          {sidebarOpen && <Sidebar />}
          <div className="flex-1 relative">
            <FlowCanvas />
          </div>
          {panelOpen && (
            <PropertyPanel onClose={() => setPanelOpen(false)} />
          )}
          {!panelOpen && (
            <button
              onClick={() => setPanelOpen(true)}
              className="absolute right-4 top-4 z-20 px-3 py-2 rounded-lg bg-[var(--flow-surface2)] border border-[var(--flow-border)] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] text-xs transition-colors"
            >
              Abrir Panel
            </button>
          )}
        </div>
      </div>
    </DndContext>
  )
}
