import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AppRole, Json, PhaseKey, WorkflowScope, WorkflowStageRow } from '@/types/database'

export const workflowsKey = ['workflows'] as const

/** Templates visible to the caller (DA-wide + programs they belong to). */
export function useWorkflowTemplates() {
  return useQuery({
    queryKey: [...workflowsKey, 'templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name')
      if (error) throw error
      return data
    },
  })
}

/** Templates usable in a program (its own active ones plus DA-wide ones) for one level. */
export function templatesForProgram<
  T extends { program_id: string | null; is_active: boolean; scope: WorkflowScope },
>(templates: T[], programId: string, scope: WorkflowScope = 'activity') {
  return templates.filter(
    (t) =>
      t.is_active && t.scope === scope && (t.program_id === null || t.program_id === programId),
  )
}

export function useTemplateStages(templateId: string | null | undefined) {
  return useQuery({
    queryKey: [...workflowsKey, 'stages', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_stages')
        .select('*')
        .eq('template_id', templateId!)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

/** Editable shape of a stage (sub-steps nested). */
export interface StageDraft {
  key: string
  name: string
  description: string
  phase_key: PhaseKey
  responsible_role: AppRole | ''
  expected_days: number
  required_documents: string[]
  required_fields: string[]
  skippable: boolean
  /** Activity workflows only: the stage that holds the procurement packages. */
  tracks_packages: boolean
  substeps: StageDraft[]
}

export function toDrafts(rows: WorkflowStageRow[]): StageDraft[] {
  const make = (r: WorkflowStageRow): StageDraft => ({
    key: r.id,
    name: r.name,
    description: r.description ?? '',
    phase_key: r.phase_key,
    responsible_role: r.responsible_role ?? '',
    expected_days: r.expected_days,
    required_documents: r.required_documents,
    required_fields: r.required_fields,
    skippable: r.skippable,
    tracks_packages: r.tracks_packages,
    substeps: rows
      .filter((c) => c.parent_id === r.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(make),
  })
  return rows
    .filter((r) => !r.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(make)
}

function toPayload(drafts: StageDraft[]): Json {
  const strip = (d: StageDraft): Record<string, Json> => ({
    name: d.name.trim(),
    description: d.description.trim(),
    phase_key: d.phase_key,
    responsible_role: d.responsible_role,
    expected_days: d.expected_days,
    required_documents: d.required_documents,
    required_fields: d.required_fields,
    skippable: d.skippable,
    tracks_packages: d.tracks_packages,
    substeps: d.substeps.map(strip),
  })
  return drafts.map(strip)
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: workflowsKey })
}

export function useCreateTemplate() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: {
      programId: string | null
      name: string
      copyFrom?: string | null
      scope?: WorkflowScope
    }) => {
      const { data, error } = await supabase.rpc('create_workflow_template', {
        p_program_id: input.programId,
        p_name: input.name,
        p_copy_from: input.copyFrom ?? null,
        p_scope: input.scope ?? 'activity',
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useSaveTemplate() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name: string
      description: string
      stages: StageDraft[]
    }) => {
      const { error } = await supabase.rpc('save_workflow_template', {
        p_template_id: input.id,
        p_name: input.name,
        p_description: input.description || null,
        p_stages: toPayload(input.stages),
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSetDefaultTemplate() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('set_default_workflow_template', { p_template_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useArchiveTemplate() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .update({ is_active: active })
        .eq('id', id)
        .select('id')
      if (error) throw error
      if (!data.length) throw new Error('You cannot change this workflow.')
    },
    onSuccess: invalidate,
  })
}
