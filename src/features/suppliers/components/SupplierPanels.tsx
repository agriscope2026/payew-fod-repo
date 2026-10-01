import { LandmarkIcon, Loader2Icon, PencilIcon, PlusIcon, StarIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SelectNative } from '@/components/ui/select-native'
import { formatDate, formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/supabase'
import type {
  SupplierBankAccountRow,
  SupplierDocType,
  SupplierDocumentRow,
  SupplierRatingRow,
  SupplierView,
} from '@/types/database'
import { useSaveBank, useSupplierDocumentMutations } from '../api'
import { DOC_TYPE_LABEL } from '../supplier-logic'
import { ExpiryLabel } from './SupplierBadges'

/** PhilGEPS + permit (from the supplier record) and other compliance documents. */
export function ComplianceDocuments({
  supplier,
  documents,
  canManage,
}: {
  supplier: SupplierView
  documents: SupplierDocumentRow[]
  canManage: boolean
}) {
  const { remove } = useSupplierDocumentMutations(supplier.id)
  const [editing, setEditing] = useState<Partial<SupplierDocumentRow> | null>(null)
  const row = (label: string, no: string | null, date: string | null, extra?: React.ReactNode) => (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{no || 'No number on file'}</span>
      </span>
      <span className="flex items-center gap-1">
        <ExpiryLabel date={date} />
        {extra}
      </span>
    </li>
  )
  return (
    <div className="space-y-2">
      <ul className="divide-y">
        {row('PhilGEPS registration', supplier.philgeps_no, supplier.philgeps_expiry)}
        {row('Business permit', supplier.permit_no, supplier.permit_expiry)}
        {documents.map((d) =>
          row(
            DOC_TYPE_LABEL[d.doc_type],
            d.doc_no,
            d.expires_on,
            canManage && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Edit document"
                  onClick={() => setEditing(d)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Delete document"
                  onClick={() =>
                    remove.mutateAsync(d.id).catch((e) => toast.error(errorMessage(e)))
                  }
                >
                  <Trash2Icon />
                </Button>
              </>
            ),
          ),
        )}
      </ul>
      {canManage && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing({ doc_type: 'tax_clearance' })}
        >
          <PlusIcon /> Add document
        </Button>
      )}
      <p className="text-muted-foreground text-xs">
        Upload the scanned copies under Attachments. Admins are notified 30 days before a document
        expires while the supplier has open packages.
      </p>
      {editing && (
        <DocumentDialog supplierId={supplier.id} doc={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function DocumentDialog({
  supplierId,
  doc,
  onClose,
}: {
  supplierId: string
  doc: Partial<SupplierDocumentRow>
  onClose: () => void
}) {
  const { save } = useSupplierDocumentMutations(supplierId)
  const [type, setType] = useState<SupplierDocType>(doc.doc_type ?? 'other')
  const [no, setNo] = useState(doc.doc_no ?? '')
  const [issued, setIssued] = useState(doc.issued_on ?? '')
  const [expires, setExpires] = useState(doc.expires_on ?? '')
  const [remarks, setRemarks] = useState(doc.remarks ?? '')
  const invalid = !!issued && !!expires && expires < issued
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{doc.id ? 'Edit document' : 'Add document'}</DialogTitle>
          <DialogDescription>Track the document number and validity.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField id="doc-type" label="Document">
            <SelectNative
              id="doc-type"
              value={type}
              onChange={(e) => setType(e.target.value as SupplierDocType)}
            >
              {Object.entries(DOC_TYPE_LABEL)
                .filter(([k]) => k !== 'philgeps' && k !== 'business_permit')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </SelectNative>
          </FormField>
          <FormField id="doc-no" label="Document No.">
            <Input id="doc-no" value={no} onChange={(e) => setNo(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="doc-issued" label="Issued on">
              <Input
                id="doc-issued"
                type="date"
                value={issued}
                onChange={(e) => setIssued(e.target.value)}
              />
            </FormField>
            <FormField
              id="doc-expires"
              label="Valid until"
              error={invalid ? 'Before issue date' : undefined}
            >
              <Input
                id="doc-expires"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="doc-remarks" label="Remarks">
            <Input id="doc-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={invalid || save.isPending}
            onClick={() =>
              save
                .mutateAsync({
                  id: doc.id,
                  doc_type: type,
                  doc_no: no.trim() || null,
                  issued_on: issued || null,
                  expires_on: expires || null,
                  remarks: remarks.trim() || null,
                })
                .then(onClose)
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            {save.isPending && <Loader2Icon className="animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Admin-only bank details; the account number is masked until revealed. */
export function BankDetails({
  supplierId,
  bank,
}: {
  supplierId: string
  bank: SupplierBankAccountRow | null | undefined
}) {
  const save = useSaveBank(supplierId)
  const [editing, setEditing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [form, setForm] = useState({
    bank_name: bank?.bank_name ?? '',
    branch: bank?.branch ?? '',
    account_name: bank?.account_name ?? '',
    account_no: bank?.account_no ?? '',
  })
  const validNo = /^[0-9 -]{4,30}$/.test(form.account_no)

  if (editing) {
    return (
      <div className="grid gap-3">
        {(
          [
            ['bank_name', 'Bank'],
            ['branch', 'Branch'],
            ['account_name', 'Account name'],
            ['account_no', 'Account No.'],
          ] as const
        ).map(([k, label]) => (
          <FormField
            key={k}
            id={`bank-${k}`}
            label={label}
            error={
              k === 'account_no' && form.account_no && !validNo
                ? 'Digits, spaces and dashes only'
                : undefined
            }
          >
            <Input
              id={`bank-${k}`}
              value={form[k]}
              autoComplete="off"
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </FormField>
        ))}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={
              !form.bank_name.trim() || !form.account_name.trim() || !validNo || save.isPending
            }
            onClick={() =>
              save
                .mutateAsync({
                  bank_name: form.bank_name.trim(),
                  branch: form.branch.trim() || null,
                  account_name: form.account_name.trim(),
                  account_no: form.account_no.trim(),
                })
                .then(() => {
                  toast.success('Bank details saved')
                  setEditing(false)
                })
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }
  if (!bank) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">No bank details on file.</p>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <LandmarkIcon /> Add bank details
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">
        {bank.bank_name}
        {bank.branch && <span className="text-muted-foreground font-normal"> · {bank.branch}</span>}
      </p>
      <p>{bank.account_name}</p>
      <p className="font-mono">
        {reveal ? bank.account_no : `•••• ${bank.account_no.replace(/\D/g, '').slice(-4)}`}{' '}
        <button
          type="button"
          className="text-primary text-xs hover:underline"
          onClick={() => setReveal(!reveal)}
        >
          {reveal ? 'Hide' : 'Show'}
        </button>
      </p>
      <p className="text-muted-foreground text-xs">Updated {formatDateTime(bank.updated_at)}</p>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        <PencilIcon /> Edit
      </Button>
    </div>
  )
}

/** Stars as text + icons (never color alone). */
export function Stars({ value }: { value: number | null }) {
  if (!value) return <span className="text-muted-foreground text-xs">No rating</span>
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${value} of 5`}
      title={`${value} of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon
          key={i}
          className={
            i < value ? 'fill-gold text-gold size-3.5' : 'text-muted-foreground/40 size-3.5'
          }
        />
      ))}
    </span>
  )
}

export function RatingsList({
  ratings,
  packageLabel,
  personName,
}: {
  ratings: SupplierRatingRow[]
  packageLabel: (id: string) => string
  personName: (id: string | null) => string
}) {
  if (!ratings.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No performance remarks yet. Add them from a package.
      </p>
    )
  }
  const rated = ratings.filter((r) => r.rating)
  const avg = rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : null
  return (
    <div className="space-y-3">
      {avg !== null && (
        <p className="flex items-center gap-2 text-sm">
          <Stars value={Math.round(avg)} /> {avg.toFixed(1)} average from {rated.length} rating
          {rated.length === 1 ? '' : 's'}
        </p>
      )}
      <ul className="space-y-2">
        {ratings.map((r) => (
          <li key={r.id} className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Stars value={r.rating} />
              <span className="text-muted-foreground text-xs">{packageLabel(r.package_id)}</span>
            </div>
            <p className="mt-1 whitespace-pre-line">{r.remark}</p>
            <p className="text-muted-foreground text-xs">
              {personName(r.created_by) || 'Admin'} · {formatDate(r.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
