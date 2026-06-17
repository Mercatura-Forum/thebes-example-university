import { Routes, Route } from 'react-router-dom'
import { MemphisGate } from '@thebes/sdk'
import { Layout } from './components/Layout'
import { Catalog } from './pages/Catalog'
import { MyCourses } from './pages/MyCourses'
import { Registrar } from './pages/Registrar'

export function App() {
  return (
    <MemphisGate appName="Quad" tagline="Sign in to register for courses.">
      <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Catalog />} />
        <Route path="/mine" element={<MyCourses />} />
        <Route path="/registrar" element={<Registrar />} />
        <Route path="*" element={<Catalog />} />
      </Route>
    </Routes>
    </MemphisGate>
  )
}
