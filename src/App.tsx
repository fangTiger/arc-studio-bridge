import { Header } from './components/Header'
import BridgeCard from './components/BridgeCard'

export default function App() {
  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: 'var(--bg-gradient)' }}
    >
      <Header />
      <main className="flex-1 flex flex-col items-center justify-start pt-4 pb-20">
        <BridgeCard />
      </main>
    </div>
  )
}
