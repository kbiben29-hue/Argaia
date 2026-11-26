import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './ui/styles.css'

// Long-pressing a card shouldn't open the browser's copy / share / save-image menu.
document.addEventListener('contextmenu', (e) => {
	const el = e.target as HTMLElement | null
	if (el?.closest('input, textarea, select, .selectable')) return
	e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
