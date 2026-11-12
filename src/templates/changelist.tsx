// Changelist page (Django's admin/change_list.html and its includes).
import type { Child } from 'hono/jsx'
import type { ChangeList } from '../changelist'
import { ALL_VAR, PAGE_VAR, SEARCH_VAR } from '../changelist'
import type { FilterChoice } from '../filters'
import { type AdminContext, type Crumb, CsrfInput, Page } from './base'
import { ErrorList } from './widgets'

export interface ResultHeader {
  text: string
  className: string
  sortable: boolean
  sorted: boolean
  ascending: boolean
  sortPriority: number
  urlPrimary: string
  urlRemove: string
  urlToggle: string
  isCheckbox?: boolean
}

export interface ResultCell {
  content: Child
  isLink: boolean
  url?: string
  className: string
  errors?: string[]
}

export interface ResultRow {
  pk: string
  cells: ResultCell[]
  hidden?: Child
}

export interface DateHierarchyView {
  back?: { link: string; title: string }
  choices: Array<{ link: string; title: string }>
}

export interface ChangeListPageProps {
  ctx: AdminContext
  title: string
  subtitle?: string | null
  cl: ChangeList
  breadcrumbs: Crumb[]
  addUrl: string | null
  addLabel: string
  verboseName: string
  verboseNamePlural: string
  headers: ResultHeader[]
  rows: ResultRow[]
  actionChoices: Array<[string, string]> | null
  actionsOnTop: boolean
  actionsOnBottom: boolean
  actionsSelectionCounter: boolean
  hasSearch: boolean
  searchHelpText: string | null
  dateHierarchy: DateHierarchyView | null
  filters: Array<{ title: string; choices: FilterChoice[] }>
  listEditable: { management: Record<string, string>; errors: number } | null
  currentModel: unknown
  bodyClass: string
  preservedFilters: string
}

function ResultCount({ cl, verboseNamePlural }: { cl: ChangeList; verboseNamePlural: string }) {
  const filtered = cl.query !== '' || cl.hasActiveFilters
  if (!filtered) return null
  return (
    <span class="small quiet">
      {cl.resultCount} result{cl.resultCount === 1 ? '' : 's'} (
      <a href={`?${cl.isPopup ? '_popup=1' : ''}`}>
        {cl.fullResultCount === null ? 'Show all' : `${cl.fullResultCount} total`}
      </a>
      ) <span class="visually-hidden">{verboseNamePlural}</span>
    </span>
  )
}

function SearchForm({ cl, props }: { cl: ChangeList; props: ChangeListPageProps }) {
  if (!props.hasSearch) return null
  const hidden: Array<[string, string]> = []
  for (const [k, v] of cl.params) if (k !== SEARCH_VAR && k !== PAGE_VAR) hidden.push([k, v])
  return (
    <div id="toolbar">
      <form id="changelist-search" method="get" role="search">
        <div>
          <label for="searchbar">
            <span class="visually-hidden">Search</span>🔍
          </label>{' '}
          <input
            type="text"
            size={40}
            name={SEARCH_VAR}
            value={cl.query}
            id="searchbar"
            aria-describedby={props.searchHelpText ? 'searchbar_helptext' : undefined}
          />{' '}
          <input type="submit" value="Search" />{' '}
          <ResultCount cl={cl} verboseNamePlural={props.verboseNamePlural} />
          {hidden.map(([k, v]) => (
            <input type="hidden" name={k} value={v} />
          ))}
        </div>
        {props.searchHelpText ? (
          <div class="help" id="searchbar_helptext">
            {props.searchHelpText}
          </div>
        ) : null}
      </form>
    </div>
  )
}

function DateHierarchy({ dh }: { dh: DateHierarchyView | null }) {
  if (!dh) return null
  return (
    <nav class="toplinks-container" aria-label="Date hierarchy">
      <ul class="toplinks">
        {dh.back ? (
          <li class="date-back">
            <a href={dh.back.link}>{dh.back.title}</a>
          </li>
        ) : null}
        {dh.choices.map((ch) => (
          <li>{ch.link ? <a href={ch.link}>{ch.title}</a> : ch.title}</li>
        ))}
      </ul>
    </nav>
  )
}

function Actions({ props, index }: { props: ChangeListPageProps; index: number }) {
  if (!props.actionChoices) return null
  const { cl } = props
  return (
    <div class="actions">
      <label>
        Action:{' '}
        <select name="action" required>
          <option value="" selected>
            ---------
          </option>
          {props.actionChoices.map(([value, label]) => (
            <option value={value}>{label}</option>
          ))}
        </select>
      </label>
      <input type="hidden" name="select_across" value="0" class="select-across" />
      <button type="submit" class="button" title="Run the selected action" name="index" value={String(index)}>
        Go
      </button>
      {props.actionsSelectionCounter ? (
        <>
          <span class="action-counter" data-actions-icnt={String(cl.resultList.length)}>
            0 of {cl.resultList.length} selected
          </span>
          {cl.resultCount !== cl.resultList.length ? (
            <>
              <span class="all hidden">All {cl.resultCount} selected</span>
              <span class="question hidden">
                <a href="#" title="Click here to select the objects across all pages">
                  Select all {cl.resultCount} {props.verboseNamePlural}
                </a>
              </span>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ResultsTable({ props }: { props: ChangeListPageProps }) {
  if (!props.rows.length && !props.headers.length) return null
  return (
    <div class="results">
      <table id="result_list">
        <thead>
          <tr>
            {props.headers.map((h) =>
              h.isCheckbox ? (
                <th scope="col" class="action-checkbox-column">
                  <div class="text">
                    <span>
                      <input
                        type="checkbox"
                        id="action-toggle"
                        aria-label="Select all objects on this page for an action"
                      />
                    </span>
                  </div>
                  <div class="clear"></div>
                </th>
              ) : (
                <th
                  scope="col"
                  class={[
                    h.className,
                    h.sortable ? 'sortable' : '',
                    h.sorted ? 'sorted' : '',
                    h.sorted ? (h.ascending ? 'ascending' : 'descending') : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {h.sorted ? (
                    <div class="sortoptions">
                      <a class="sortremove" href={h.urlRemove} title="Remove from sorting">
                        <span class="visually-hidden">Remove from sorting</span>
                      </a>
                      {h.sortPriority > 0 ? (
                        <span class="sortpriority" title={`Sorting priority: ${h.sortPriority}`}>
                          {h.sortPriority}
                        </span>
                      ) : null}
                      <a
                        href={h.urlToggle}
                        class={`toggle ${h.ascending ? 'ascending' : 'descending'}`}
                        title="Toggle sorting"
                      >
                        <span class="visually-hidden">Toggle sorting</span>
                      </a>
                    </div>
                  ) : null}
                  <div class="text">
                    {h.sortable ? <a href={h.urlPrimary}>{h.text}</a> : <span>{h.text}</span>}
                  </div>
                  <div class="clear"></div>
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr>
              {row.cells.map((cell) => {
                if (cell.isLink) {
                  return (
                    <th class={cell.className}>
                      {cell.url ? <a href={cell.url}>{cell.content}</a> : cell.content}
                    </th>
                  )
                }
                return (
                  <td class={cell.className}>
                    <ErrorList errors={cell.errors} />
                    {cell.content}
                  </td>
                )
              })}
              {row.hidden}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pagination({ props }: { props: ChangeListPageProps }) {
  const { cl } = props
  const pages = cl.multiPage && !(cl.showAll && cl.canShowAll) ? cl.pageRange() : []
  return (
    <nav class="paginator" aria-label="Pagination">
      {pages.length
        ? pages.map((p) =>
            p === '…' ? (
              '… '
            ) : p === cl.page ? (
              <span class="this-page" aria-current="page">
                {p}
              </span>
            ) : (
              <a
                href={cl.getQueryString({ [PAGE_VAR]: p }, [ALL_VAR])}
                class={p === cl.numPages ? 'end' : undefined}
              >
                {p}
              </a>
            ),
          )
        : null}
      {pages.length ? ' ' : ''}
      {cl.resultCount} {cl.resultCount === 1 ? props.verboseName : props.verboseNamePlural}
      {cl.multiPage && cl.canShowAll && !cl.showAll ? (
        <>
          {' '}
          <a href={cl.getQueryString({ [ALL_VAR]: '' }, [PAGE_VAR])} class="showall">
            Show all
          </a>
        </>
      ) : null}
      {props.listEditable && props.rows.length ? (
        <input type="submit" name="_save" class="default" value="Save" />
      ) : null}
    </nav>
  )
}

function FilterSidebar({ props }: { props: ChangeListPageProps }) {
  if (!props.filters.length) return null
  const { cl } = props
  return (
    <nav id="changelist-filter" aria-labelledby="changelist-filter-header">
      <h2 id="changelist-filter-header">Filter</h2>
      {cl.hasActiveFilters ? (
        <h3 id="changelist-filter-clear">
          <a href={cl.clearAllFiltersQs}>✖ Clear all filters</a>
        </h3>
      ) : null}
      {props.filters.map((f) => (
        <details data-filter-title={f.title} open>
          <summary>By {f.title}</summary>
          <ul>
            {f.choices.map((ch) => (
              <li class={ch.selected ? 'selected' : undefined}>
                <a href={ch.queryString} aria-current={ch.selected ? 'true' : undefined}>
                  {ch.display}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  )
}

export function ChangeListPage(props: ChangeListPageProps) {
  const { ctx, cl } = props
  const hasFilters = props.filters.length > 0
  const formEnctype = props.listEditable ? 'multipart/form-data' : undefined
  return (
    <Page
      ctx={ctx}
      title={props.title}
      subtitle={props.subtitle}
      bodyClass={props.bodyClass}
      breadcrumbs={props.breadcrumbs}
      contentClass="flex"
      navSidebar
      currentModel={props.currentModel}
    >
      {props.listEditable?.errors ? (
        <p class="errornote">
          {props.listEditable.errors === 1
            ? 'Please correct the error below.'
            : 'Please correct the errors below.'}
        </p>
      ) : null}
      <div id="content-main">
        {props.addUrl ? (
          <ul class="object-tools">
            <li>
              <a href={props.addUrl} class="addlink">
                {props.addLabel}
              </a>
            </li>
          </ul>
        ) : null}
        <div class={`module${hasFilters ? ' filtered' : ''}`} id="changelist">
          <div class="changelist-form-container">
            <SearchForm cl={cl} props={props} />
            <DateHierarchy dh={props.dateHierarchy} />
            <form id="changelist-form" method="post" enctype={formEnctype} novalidate>
              <CsrfInput token={ctx.csrfToken} />
              {props.listEditable
                ? Object.entries(props.listEditable.management).map(([k, v]) => (
                    <input type="hidden" name={k} value={v} id={`id_${k}`} />
                  ))
                : null}
              {props.actionsOnTop && props.rows.length ? <Actions props={props} index={0} /> : null}
              {props.rows.length ? (
                <ResultsTable props={props} />
              ) : (
                <p class="paginator-empty">0 {props.verboseNamePlural}</p>
              )}
              {props.actionsOnBottom && props.rows.length ? (
                <Actions props={props} index={props.actionsOnTop ? 1 : 0} />
              ) : null}
              <Pagination props={props} />
            </form>
          </div>
          <FilterSidebar props={props} />
        </div>
      </div>
    </Page>
  )
}
