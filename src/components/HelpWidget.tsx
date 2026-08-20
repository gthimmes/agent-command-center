import { useEffect, useRef } from 'react'
import { HelpNavigator } from 'help-navigator'
import { helpContent } from '../help/content.ts'
import { helpArticlesFor } from '../help/context.ts'

// Mounts the in-app help center (floating launcher bottom-right, F1 to
// toggle) and keeps "Suggested for this page" in sync with the app view.
// AgentPower has no URL router, so App.tsx passes a pseudo-pathname derived
// from its view state (see src/help/context.ts).
export function HelpWidget({ pathname }: { pathname: string }) {
  const helpRef = useRef<HelpNavigator | null>(null)

  useEffect(() => {
    const help = HelpNavigator.init({
      content: helpContent,
      theme: 'dark',
      accentColor: '#7c3aed',
      position: 'bottom-right',
      hotkey: 'F1',
      texts: { panelTitle: 'AgentPower Help' },
    })
    helpRef.current = help
    return () => {
      helpRef.current = null
      help.destroy()
    }
  }, [])

  useEffect(() => {
    helpRef.current?.setContext(helpArticlesFor(pathname))
  }, [pathname])

  return null
}
