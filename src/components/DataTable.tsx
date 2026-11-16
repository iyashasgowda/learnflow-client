import type { ReactNode } from 'react';

interface Props {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
}

// Every chart has its numbers here as text, so nothing depends on seeing the picture.
export function DataTable({ caption, columns, rows }: Props) {
  return (
    <details className="chart-data">
      <summary>Show the data as a table</summary>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, position) => (position === 0 ? <th key={position} scope="row">{cell}</th> : <td key={position}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
