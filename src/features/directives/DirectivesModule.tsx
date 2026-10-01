import { Route, Routes } from 'react-router-dom'
import DirectiveDetailPage from './pages/DirectiveDetailPage'
import DirectivesListPage from './pages/DirectivesListPage'

/** /directives, /directives/:id */
export default function DirectivesModule() {
  return (
    <Routes>
      <Route index element={<DirectivesListPage />} />
      <Route path=":id" element={<DirectiveDetailPage />} />
    </Routes>
  )
}
