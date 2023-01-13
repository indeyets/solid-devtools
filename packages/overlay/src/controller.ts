import { enableRootsAutoattach, useDebugger } from '@solid-devtools/debugger'
import { Controller, createController } from '@solid-devtools/frontend'
import { defer } from '@solid-devtools/shared/primitives'
import { createEffect, onCleanup } from 'solid-js'

enableRootsAutoattach()

const clone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj))
const separate = <T>(obj: T, callback: (value: T) => void): void => {
  queueMicrotask(() => {
    const v = clone(obj)
    queueMicrotask(() => callback(v))
  })
}

export function createOverlayController(): Controller {
  const debug = useDebugger()

  onCleanup(() => debug.setInspectedNode(null))

  const controller = createController()
  const { devtools, client } = controller

  devtools.on('devtoolsLocatorStateChange', enabled => {
    queueMicrotask(() => debug.locator.toggleEnabled(enabled))
  })
  devtools.on('highlightElementChange', data => {
    queueMicrotask(() => debug.locator.setHighlightTarget(data))
  })
  devtools.on('inspectNode', node => {
    queueMicrotask(() => debug.setInspectedNode(node))
  })
  devtools.on('inspectValue', node => {
    queueMicrotask(() => debug.inspector.toggleValueNode(node))
  })
  devtools.on('openLocation', () => {
    queueMicrotask(() => debug.openInspectedNodeLocation())
  })
  devtools.on('treeViewModeChange', mode => {
    queueMicrotask(() => debug.structure.setTreeWalkerMode(mode))
  })

  debug.listenTo('StructureUpdates', updates => {
    queueMicrotask(() => client.structureUpdate.emit(updates))
  })

  debug.listenTo('ComputationUpdates', updates => {
    queueMicrotask(() => client.computationUpdates.emit(updates))
  })

  debug.listenTo('InspectorUpdate', payload => {
    separate(payload, client.inspectorUpdate.emit)
  })

  // send the focused owner details
  debug.listenTo('InspectedNodeDetails', details => {
    separate(details, client.setInspectedDetails.emit)
  })

  // send the state of the client locator mode
  createEffect(
    defer(debug.locator.enabledByDebugger, state => {
      queueMicrotask(() => client.clientLocatorModeChange.emit(state))
    }),
  )

  // intercept on-page components clicks and send them to the devtools overlay
  debug.locator.addClickInterceptor((e, component) => {
    e.preventDefault()
    e.stopPropagation()
    queueMicrotask(() => client.clientInspectedNode.emit(component.id))
    return false
  })

  debug.locator.onHoveredComponent(data => {
    queueMicrotask(() => client.clientHoveredComponent.emit(data))
  })

  return controller
}
