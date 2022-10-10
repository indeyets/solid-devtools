import { batch, createEffect, createSignal, on, onCleanup } from 'solid-js'
import { createInternalRoot, useDebugger } from '@solid-devtools/debugger'
import * as Locator from '@solid-devtools/locator'
import {
  Messages,
  onWindowMessage,
  postWindowMessage,
  startListeningWindowMessages,
} from '@solid-devtools/shared/bridge'
import { warn } from '@solid-devtools/shared/utils'

startListeningWindowMessages()

// in case of navigation/page reload, reset the locator mode state in the extension
postWindowMessage('ResetPanel')

postWindowMessage('SolidOnPage', process.env.VERSION!)

let loadedBefore = false

createInternalRoot(() => {
  const [enabled, setEnabled] = createSignal(false)
  Locator.addHighlightingSource(enabled)

  const {
    forceTriggerUpdate,
    findComponent,
    listenTo,
    setInspectedNode,
    inspectedDetails,
    getElementById,
    setInspectedSignal,
    setInspectedProp,
    setInspectedValue,
  } = useDebugger({ enabled })

  // update the graph only if the devtools panel is in view
  onWindowMessage('PanelVisibility', setEnabled)

  // disable debugger and reset any state
  onWindowMessage('PanelClosed', () => {
    batch(() => {
      setEnabled(false)
      setInspectedNode(null)
    })
  })

  createEffect(() => {
    if (!enabled()) return

    if (loadedBefore) forceTriggerUpdate()
    else loadedBefore = true

    onCleanup(onWindowMessage('ForceUpdate', forceTriggerUpdate))

    onCleanup(onWindowMessage('InspectedNodeChange', setInspectedNode))

    onCleanup(
      onWindowMessage('ToggleInspectedValue', payload => {
        if (payload.type === 'signal') {
          const { id, selected } = payload
          const value = setInspectedSignal(id, selected)
          if (value) postWindowMessage('SignalUpdates', { signals: [{ id, value }], update: false })
        } else if (payload.type === 'prop') {
          const { id, selected } = payload
          setInspectedProp(id, selected)
        } else {
          setInspectedValue(payload.selected)
        }
      }),
    )

    listenTo('StructureUpdates', updates => postWindowMessage('StructureUpdate', updates))

    listenTo('ComputationUpdates', updates => postWindowMessage('ComputationUpdates', updates))

    listenTo('SignalUpdates', updates => {
      postWindowMessage('SignalUpdates', { signals: updates, update: true })
    })

    listenTo('PropsUpdate', updates => postWindowMessage('PropsUpdate', updates))

    listenTo('ValueUpdate', ({ value, update }) => {
      postWindowMessage('ValueUpdate', { value, update })
    })

    // send the focused owner details
    createEffect(() => {
      const details = inspectedDetails()
      if (details) postWindowMessage('SetInspectedDetails', details)
    })

    // TODO: abstract state sharing to a separate package
    // state of the extension's locator mode
    const [extLocatorEnabled, setExtLocatorEnabled] = createSignal(false)
    Locator.addLocatorModeSource(extLocatorEnabled)
    onCleanup(onWindowMessage('ExtLocatorMode', setExtLocatorEnabled))
    createEffect(
      on(Locator.locatorModeEnabled, state => postWindowMessage('ClientLocatorMode', state), {
        defer: true,
      }),
    )

    // intercept on-page components clicks and send them to the devtools panel
    Locator.addClickInterceptor((e, component) => {
      e.preventDefault()
      e.stopPropagation()
      postWindowMessage('ClientInspectedNode', component.id)
      return false
    })

    let skipNextHoveredComponent = true
    let prevHoverMessage: Messages['ClientHoveredNodeChange'] | null = null
    // listen for op-page components being hovered and send them to the devtools panel
    createEffect(() => {
      const hovered = Locator.highlightedComponent()[0] as Locator.HoveredComponent | undefined
      if (skipNextHoveredComponent) return (skipNextHoveredComponent = false)
      if (!hovered) {
        if (prevHoverMessage && prevHoverMessage.state)
          postWindowMessage(
            'ClientHoveredNodeChange',
            (prevHoverMessage = { nodeId: prevHoverMessage.nodeId, state: false }),
          )
      } else {
        postWindowMessage(
          'ClientHoveredNodeChange',
          (prevHoverMessage = { nodeId: hovered.id, state: true }),
        )
      }
    })

    onCleanup(
      onWindowMessage('HighlightElement', payload => {
        if (!payload) return Locator.setTarget(null)
        let target: Locator.TargetComponent | HTMLElement
        // highlight component
        if (typeof payload === 'object') {
          const { rootId, nodeId } = payload
          const component = findComponent(rootId, nodeId)
          if (!component) return warn('No component found', nodeId)
          target = { ...component, rootId }
        }
        // highlight element
        else {
          const element = getElementById(payload)
          if (!element) return warn('No element found', payload)
          target = element
        }
        Locator.setTarget(p => {
          if (p === target) return p
          // prevent creating an infinite loop
          skipNextHoveredComponent = true
          return target
        })
      }),
    )
  })
})
