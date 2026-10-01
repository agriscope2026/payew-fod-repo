import { Route, Routes } from 'react-router-dom'
import SupplierDetailPage from './pages/SupplierDetailPage'
import SuppliersListPage from './pages/SuppliersListPage'

/** /suppliers, /suppliers/:id */
export default function SuppliersModule() {
  return (
    <Routes>
      <Route index element={<SuppliersListPage />} />
      <Route path=":id" element={<SupplierDetailPage />} />
    </Routes>
  )
}
