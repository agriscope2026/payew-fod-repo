import { Loader2Icon } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useMasterList } from '@/features/settings/master-lists/api'
import { errorMessage } from '@/lib/supabase'
import type { AttachmentRow } from '@/types/database'
import { extensionOf } from '@shared/files-core'
import { useUpdateAttachment } from '../api'
import { parseTags } from '../utils'

export function EditFileDialog({
  file,
  onClose,
}: {
  file: AttachmentRow | null
  onClose: () => void
}) {
  return file ? <EditFileBody key={file.id} file={file} onClose={onClose} /> : null
}

function EditFileBody({ file, onClose }: { file: AttachmentRow; onClose: () => void }) {
  const update = useUpdateAttachment()
  const { data: docTypes = [] } = useMasterList('document_types', {}, { activeOnly: true })
  const [name, setName] = useState(file.file_name)
  const [docTypeId, setDocTypeId] = useState(file.document_type_id ?? '')
  const [folder, setFolder] = useState(file.folder ?? '')
  const [tags, setTags] = useState(file.tags.join(', '))
  const [description, setDescription] = useState(file.description ?? '')

  const ext = extensionOf(file.file_name)
  const nameError = !name.trim()
    ? 'Enter a file name'
    : ext && extensionOf(name) !== ext
      ? `Keep the .${ext} extension`
      : null

  const save = async () => {
    if (nameError) return
    try {
      await update.mutateAsync({
        id: file.id,
        changes: {
          file_name: name.trim(),
          document_type_id: docTypeId || null,
          folder: folder.trim() || null,
          tags: parseTags(tags),
          description: description.trim() || null,
        },
      })
      toast.success('File details saved')
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Applies to version {file.version}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField id="ed-name" label="File name" error={nameError ?? undefined}>
            <Input
              id="ed-name"
              value={name}
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="ed-type" label="Document type">
              <SelectNative
                id="ed-type"
                value={docTypeId}
                onChange={(e) => setDocTypeId(e.target.value)}
              >
                <option value="">Unclassified</option>
                {docTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {String(t.code)} · {String(t.name)}
                  </option>
                ))}
              </SelectNative>
            </FormField>
            <FormField id="ed-folder" label="Folder">
              <Input
                id="ed-folder"
                value={folder}
                maxLength={200}
                onChange={(e) => setFolder(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="ed-tags" label="Tags" hint="Comma-separated">
            <Input id="ed-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </FormField>
          <FormField id="ed-desc" label="Description">
            <Textarea
              id="ed-desc"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={update.isPending || !!nameError}>
            {update.isPending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
