import { ArrowRightIcon, BookOpenIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FAQS, GLOSSARY, TUTORIALS } from './content'

const has = (needle: string, ...texts: (string | undefined)[]) =>
  texts.some((t) => t?.toLowerCase().includes(needle))

/** /guide — tutorials, FAQ and glossary, searchable. */
export default function GuidePage() {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const tutorials = TUTORIALS.filter(
    (t) => !needle || has(needle, t.title, t.summary, ...t.steps, ...(t.tips ?? [])),
  )
  const faqs = FAQS.filter((f) => !needle || has(needle, f.q, f.a))
  const terms = GLOSSARY.filter((g) => !needle || has(needle, g.term, g.meaning))
  const nothing = !tutorials.length && !faqs.length && !terms.length

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Guide"
        description="How to plan, implement, procure, pay and report in PAYEW."
      />
      <div className="relative max-w-md">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          className="pl-8"
          placeholder="Search the guide (e.g. ORS, re-award, payables)…"
          aria-label="Search the guide"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {nothing ? (
        <Card>
          <EmptyState icon={BookOpenIcon} title="Nothing found" description="Try another word." />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="Guide contents" className="hidden lg:block">
            <div className="sticky top-20 space-y-4 text-sm">
              {tutorials.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                    Tutorials
                  </p>
                  <ul className="space-y-1">
                    {tutorials.map((t) => (
                      <li key={t.id}>
                        <a href={`#${t.id}`} className="hover:text-primary hover:underline">
                          {t.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {faqs.length > 0 && (
                <a href="#faq" className="block hover:underline">
                  FAQ
                </a>
              )}
              {terms.length > 0 && (
                <a href="#glossary" className="block hover:underline">
                  Glossary
                </a>
              )}
            </div>
          </nav>

          <div className="min-w-0 space-y-6">
            {tutorials.map((t) => (
              <Card key={t.id} id={t.id} className="scroll-mt-20">
                <CardHeader>
                  <CardTitle className="text-lg">{t.title}</CardTitle>
                  <CardDescription>{t.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
                    {t.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  {t.tips && (
                    <div className="bg-muted/50 rounded-md p-3 text-sm">
                      <p className="mb-1 font-medium">Tips</p>
                      <ul className="list-disc space-y-1 pl-5">
                        {t.tips.map((tip, i) => (
                          <li key={i}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {t.link && (
                    <Button asChild variant="outline" size="sm">
                      <Link to={t.link.to}>
                        {t.link.label} <ArrowRightIcon />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}

            {faqs.length > 0 && (
              <section id="faq" className="scroll-mt-20 space-y-3">
                <h2 className="text-lg font-semibold">Frequently asked questions</h2>
                <Card className="py-2">
                  <CardContent className="divide-y">
                    {faqs.map((f) => (
                      <details key={f.q} className="group py-3" open={!!needle}>
                        <summary className="marker:text-muted-foreground cursor-pointer text-sm font-medium">
                          {f.q}
                        </summary>
                        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.a}</p>
                      </details>
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}

            {terms.length > 0 && (
              <section id="glossary" className="scroll-mt-20 space-y-3">
                <h2 className="text-lg font-semibold">Glossary</h2>
                <Card className="py-2">
                  <CardContent>
                    <dl className="divide-y text-sm">
                      {terms.map((g) => (
                        <div key={g.term} className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
                          <dt className="font-semibold">{g.term}</dt>
                          <dd className="text-muted-foreground">{g.meaning}</dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
