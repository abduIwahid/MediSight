"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTableProps<TData> {
  columns: {
    header: string
    accessorKey?: keyof TData
    cell?: (item: TData) => React.ReactNode
    /** Hide this column below the sm breakpoint — registry tables use
     *  it for low-priority columns so Name + Risk Status/Fee stay
     *  visible at 360px without sideways scrolling (QA Round 2,
     *  cluster 28). */
    hideOnMobile?: boolean
  }[]
  data: TData[]
  onRowClick?: (item: TData) => void
}

export function DataTable<TData>({ columns, data, onRowClick }: DataTableProps<TData>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead key={i} className={col.hideOnMobile ? "hidden sm:table-cell" : undefined}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow
                key={i}
                className={cn(
                  "transition-all duration-200",
                  onRowClick ? "cursor-pointer hover:bg-muted hover:shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.05)] dark:hover:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.05)]" : "hover:bg-muted/50"
                )}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map((col, j) => (
                  <TableCell key={j} className={col.hideOnMobile ? "hidden sm:table-cell" : undefined}>
                    {j === 0 && onRowClick ? (
                      // First-cell control pattern (QA Round 2, cluster
                      // 29): the row itself used to carry role="button"
                      // + tabIndex, which destroys screen-reader table
                      // semantics and makes every row a tab stop. A real
                      // button in the first cell keeps the row action
                      // keyboard- and SR-operable inside an intact
                      // table; the row's mouse onClick stays.
                      <button
                        type="button"
                        className="rounded-sm text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRowClick(row)
                        }}
                      >
                        {col.cell ? col.cell(row) : (col.accessorKey ? String(row[col.accessorKey]) : null)}
                      </button>
                    ) : (
                      col.cell ? col.cell(row) : (col.accessorKey ? String(row[col.accessorKey]) : null)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
