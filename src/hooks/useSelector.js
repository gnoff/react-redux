import React, {
  useContext,
  useRef,
  useReducer,
  useCallback,
  useLayoutEffect,
  useEffect
} from 'react'

import { ReactReduxContext } from '../components/Context'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure we can
// run effects before the node is updated in our queue
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

/*
  makeUseSelector is implemented as a factory first in order to support the need
  for user supplied contexts.
*/
export function makeUseSelector(Context) {
  /*
    useSelector is designed to work with the node semantics of the updater
    which drive state updates into components in a top down manner and propogate
    new states to connected components and hooks in a consistent manner

    The general approach is to make the useSelector instance known to the updater
    by creating a node on the very first render for the useSelector instance.
    This constraint ensures the updater has an unamiguous order in which to
    execute updates.

    The node holds information about that last rendered state for this useSelector
    instance. useSelector's are comging into existence when the updater is not
    currently dispatching an update then it simply reads the latest state and
    memozies the computation until either the state or the selector change

    It also provides the updater node an update function. the updater will use
    this function to potentially trigger a re-render when a state update is being
    processed.

    It is useful to know that depending on a nodes position next to it's
    neighbors the node will 'see' new states as it is re-rendered but never
    have it's updater called. This is because if a preceding node (a node in a parent
    component for instance) triggers an update and that causes this node's owner
    (the component calling useSelector) to rerender then the node will appear to
    already be on the latest state by the time the updater gets around to
    deciding whether to call the update function (it will skip it)
  */
  return function useSelector(selector, deps) {
    // use react-redux context
    let context = useContext(Context)

    // memoize the selector with the provided deps
    let select = useCallback(selector, deps)

    // expose a ref to updater so the node can access the latest update function
    let updateRef = useRef(null)

    // on mount construct a node with a ref to the updater
    let nodeRef = useRef(null)
    if (nodeRef.current === null) {
      nodeRef.current = context.createNode(updateRef)
    }

    // this node identity will be stable across re-renders
    let node = nodeRef.current

    // this queue identity will be stable across re-renders
    let queue = node.queue

    // this queueState is the latest state the queue knows about
    let queueState = queue.state

    let stateRef = useRef(queueState)
    useIsomorphicLayoutEffect(() => {
      stateRef.current = queueState
    }, [queueState])

    let reducer = useCallback(
      (lastSlice, nextState) => {
        if (stateRef.current !== nextState) {
          console.log('state is new, running selector', select(nextState))
          return select(nextState)
        }
        console.log('state is same, returning lastSlice', lastSlice)
        return lastSlice
      },
      [select]
    )

    // compute slice if necessary
    let [slice, dispatch] = useReducer(reducer, null, () => select(queueState))

    // update listener for next update and nullify on unmount
    useIsomorphicLayoutEffect(() => {
      updateRef.current = state => {
        console.log('updating node')
        // context.updating(node)
        dispatch(state)
      }
      return () => (updateRef.current = null)
    }, [])

    return slice
  }
}

export const useSelector = makeUseSelector(ReactReduxContext)
