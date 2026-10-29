import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Today } from './pages/Today'
import { Review } from './pages/Review'
import { Browse } from './pages/Browse'
import { Stats } from './pages/Stats'
import { Settings } from './pages/Settings'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Today />} />
          <Route path="/review" element={<Review />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Today />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
