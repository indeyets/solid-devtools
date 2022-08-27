import { createEffect, createRoot, on } from "solid-js"
import { createRuntimeMessanger } from "../../shared/messanger"
import { handleComputationsUpdate, handleGraphUpdate, hovered, resetGraph } from "./graph"
import {
  focused,
  focusedRootId,
  handleSignalUpdates,
  updateDetails,
  handleGraphUpdate as detailsHandleGraphUpdate,
  setOnSignalSelect,
} from "./details"
import { Messages } from "@solid-devtools/shared/bridge"
import { NodeType } from "@solid-devtools/shared/graph"

export const { onRuntimeMessage, postRuntimeMessage } = createRuntimeMessanger()

// in development — force update the graph on load to work with hot reloading
if (import.meta.env.DEV) {
  postRuntimeMessage("ForceUpdate")
}

onRuntimeMessage("GraphUpdate", update => {
  handleGraphUpdate(update)
  detailsHandleGraphUpdate()
})

onRuntimeMessage("ResetPanel", () => {
  resetGraph()
  detailsHandleGraphUpdate()
})

onRuntimeMessage("ComputationUpdates", updates => {
  handleComputationsUpdate(updates.map(u => u.id))
})

onRuntimeMessage("SignalUpdates", updates => {
  handleSignalUpdates(updates)
})

onRuntimeMessage("OwnerDetailsUpdate", details => {
  updateDetails(details)
})

onRuntimeMessage("SignalValue", update => {
  // updates the signal value but without causing it to highlight
  handleSignalUpdates([update], false)
})

// let visibility = false
// onRuntimeMessage("PanelVisibility", newVisibility => {
//   visibility = newVisibility
//   if (visibility) {
//     // panel
//   }
//   log("PanelVisibility", visibility)
// })

createRoot(() => {
  // toggle selected owner
  createEffect(
    on(
      [focused, focusedRootId],
      ([owner, rootId]) => {
        const payload = owner && rootId ? { ownerId: owner.id, rootId } : null
        postRuntimeMessage("SetSelectedOwner", payload)
      },
      { defer: true },
    ),
  )

  let initHighlight = true
  // toggle hovered component
  createEffect<Messages["HighlightElement"] | undefined>(prev => {
    // tracks
    const { rootId, owner } = hovered
    // skip initial value
    if (initHighlight) return (initHighlight = false) || undefined
    if (!rootId || !owner || owner.type !== NodeType.Component) {
      if (prev) postRuntimeMessage("HighlightElement", null)
      return
    }
    // do not send the same message twice
    if (prev && prev.nodeId === owner.id) return prev
    const payload = { rootId, nodeId: owner.id }
    postRuntimeMessage("HighlightElement", payload)
    return payload
  })

  // toggle selected signals
  setOnSignalSelect((id, selected) => {
    postRuntimeMessage("SetSelectedSignal", { id, selected })
  })
})
