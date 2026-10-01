import { Route, Routes } from 'react-router-dom'
import ActivitiesListPage from './pages/ActivitiesListPage'
import ActivityDetailPage from './pages/ActivityDetailPage'
import ActivityFormPage from './pages/ActivityFormPage'
import PackageDetailPage from '@/features/packages/pages/PackageDetailPage'

/** /activities, /activities/new, /activities/:id, /activities/:id/edit, /activities/:id/packages/:packageId */
export default function ActivitiesModule() {
  return (
    <Routes>
      <Route index element={<ActivitiesListPage />} />
      <Route path="new" element={<ActivityFormPage />} />
      <Route path=":id" element={<ActivityDetailPage />} />
      <Route path=":id/edit" element={<ActivityFormPage />} />
      <Route path=":id/packages/:packageId" element={<PackageDetailPage />} />
    </Routes>
  )
}
