import { Route, Routes } from 'react-router-dom'
import ActivitiesListPage from './pages/ActivitiesListPage'
import ActivityDetailPage from './pages/ActivityDetailPage'
import ActivityFormPage from './pages/ActivityFormPage'

/** /activities, /activities/new, /activities/:id, /activities/:id/edit */
export default function ActivitiesModule() {
  return (
    <Routes>
      <Route index element={<ActivitiesListPage />} />
      <Route path="new" element={<ActivityFormPage />} />
      <Route path=":id" element={<ActivityDetailPage />} />
      <Route path=":id/edit" element={<ActivityFormPage />} />
    </Routes>
  )
}
