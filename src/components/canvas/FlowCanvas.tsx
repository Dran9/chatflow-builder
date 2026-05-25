import { useCallback, useRef, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  BackgroundVariant,
  Connection,
  Node,
  Edge,
  NodeTypes,
  ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useStore } from '@/store/workspace'
import StepNode from './StepNode'
import type { StepType, StepData } from '@/types'
import { STEP_COLORS } from '@/lib/step-definitions'

const nodeTypes: NodeTypes = {
  step: StepNode,
}

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: '#4a4a6a', strokeWidth: 1.5 },
}

export default function FlowCanvas() {
  const activeFlow = useStore((s) => s.activeFlow())
  const addEdgeAction = useStore((s) => s.addEdge)
  const updateNodePosition = useStore((s) => s.moveNode)
  const setSelectedNode = useStore((s) => s.setSelectedNode)
  const addNodeFromStep = useStore((s) => s.addNode)
  const removeNode = useStore((s) => s.removeNode)
  const removeEdge = useStore((s) => s.removeEdge)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const rfInstance = useRef<ReactFlowInstance | null>(null)

  const flowNodes: Node<StepData>[] = useMemo(
    () =>
      activeFlow.nodes.map((n) => ({
        id: n.id,
        type: 'step',
        position: n.position,
        data: n.data,
        selected: false,
        dragging: false,
      })),
    [activeFlow.nodes],
  )

  const flowEdges: Edge[] = useMemo(
    () =>
      activeFlow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle,
        label: e.label,
        animated: true,
        style: { stroke: '#4a4a6a', strokeWidth: 1.5 },
        labelStyle: { fill: '#8888a0', fontSize: 9, fontWeight: 500 },
        labelBgStyle: { fill: '#1a1a24', fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 3,
      })),
    [activeFlow.edges],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      addEdgeAction(params.source, params.target, params.sourceHandle ?? 'default', undefined)
    },
    [addEdgeAction],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => setSelectedNode(node.id),
    [setSelectedNode],
  )

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => updateNodePosition(node.id, node.position),
    [updateNodePosition],
  )

  const onPaneClick = useCallback(() => setSelectedNode(null), [setSelectedNode])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const stepType = event.dataTransfer.getData('application/stepType') as StepType
      if (!stepType) return

      const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!wrapperBounds || !rfInstance.current) return

      const position = rfInstance.current.project({
        x: event.clientX - wrapperBounds.left - 70,
        y: event.clientY - wrapperBounds.top - 18,
      })

      addNodeFromStep(stepType, stepType, position)
    },
    [addNodeFromStep],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = useStore.getState().selectedNodeId
        if (selected) {
          removeNode(selected)
        }
      }
    },
    [removeNode],
  )

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onInit={onInit}
        fitView
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        panOnScroll
        selectionOnDrag
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineStyle={{ stroke: '#8b5cf6', strokeWidth: 1.5 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#2a2a3a" />
        <Controls
          position="bottom-right"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  )
}
