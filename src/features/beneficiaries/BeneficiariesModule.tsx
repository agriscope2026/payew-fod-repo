import { Route, Routes } from 'react-router-dom'
import BeneficiariesListPage from './pages/BeneficiariesListPage'
import BeneficiaryDetailPage from './pages/BeneficiaryDetailPage'

/** /beneficiaries and /beneficiaries/:id */
export default function BeneficiariesModule() {
  return (
    <Routes>
      <Route index element={<BeneficiariesListPage />} />
      <Route path=":id" element={<BeneficiaryDetailPage />} />
    </Routes>
  )
}
