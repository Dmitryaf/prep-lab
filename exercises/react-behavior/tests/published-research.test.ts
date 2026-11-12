// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

// The repository checks published Markdown directly. The standalone ZIP has
// its own runnable examples; it intentionally does not ship the knowledge base.
const notesRoot = resolve(process.cwd(), '../../content/common');
const available = existsSync(notesRoot);
function publishedSource(path: string, marker: string) {
  const text = readFileSync(resolve(notesRoot, path), 'utf8').replace(/^> ?/gm, '');
  const source = [...text.matchAll(/```(?:jsx|tsx)\n([\s\S]*?)```/g)]
    .find(match => match[1].includes(`// checked-example: ${marker}`))?.[1];
  if (!source) throw new Error(`Missing published example: ${marker}`);
  return source;
}
function component(path: string, marker: string, name: string) {
  const source = publishedSource(path, marker);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function('require', 'exports', 'React', `${compiled}\nreturn ${name};`)(
    (name: string) => { if (name !== 'react') throw new Error(name); return React; }, {}, React,
  ) as React.ComponentType<Record<string, unknown>>;
}
function deferred() {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.skipIf(!available)('published research examples', () => {
  test('Typography type contract accepts correct props and rejects href without anchor', () => {
    const source = publishedSource('Собеседования/Практика/React.md', 'react-typography');
    const filename = resolve('src/published-research.tsx').replaceAll('\\', '/');
    function diagnostics(code: string) {
      const options: ts.CompilerOptions = {
        strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
        noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
      };
      const host = ts.createCompilerHost(options), original = host.getSourceFile.bind(host);
      host.getSourceFile = (file, version, onError, createNew) => file === filename
        ? ts.createSourceFile(file, code, ts.ScriptTarget.ES2022, true)
        : original(file, version, onError, createNew);
      return ts.getPreEmitDiagnostics(ts.createProgram([filename], options, host));
    }
    expect(diagnostics(source).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
    expect(diagnostics(source.replace(/^.*@ts-expect-error.*$/gm, ''))).toHaveLength(2);
  });
  test('load more appends, deduplicates, preserves rows on error and retries the same cursor', async () => {
    const PagedUsers = component('Собеседования/Практика/React.md', 'react-load-more', 'PagedUsers');
    const calls: Array<ReturnType<typeof deferred> & { filter: string; cursor: unknown; signal: AbortSignal }> = [];
    const loadPage = vi.fn((filter: string, cursor: unknown, { signal }: {signal: AbortSignal}) => {
      const request = { ...deferred(), filter, cursor, signal }; calls.push(request); return request.promise;
    });
    render(React.createElement(React.StrictMode, {}, React.createElement(PagedUsers, {filter: 'a', loadPage})));
    expect(calls).toHaveLength(2);
    expect(calls[0].signal.aborted).toBe(true);
    await act(async () => { calls[1].resolve({items: [{id: '1', name: 'First'}], next: 'cursor-2'}); });
    const original = screen.getByText('First');
    const more = screen.getByRole('button', {name: 'Загрузить ещё'});
    fireEvent.click(more); fireEvent.click(more);
    expect(calls).toHaveLength(3); expect(calls[2].cursor).toBe('cursor-2');
    await act(async () => { calls[2].reject(new Error('offline')); });
    expect(screen.getByRole('alert')).toBeTruthy(); expect(screen.getByText('First')).toBe(original);
    fireEvent.click(screen.getByRole('button', {name: 'Повторить'}));
    expect(calls[3].cursor).toBe('cursor-2');
    await act(async () => { calls[3].resolve({items: [{id: '1', name: 'Duplicate'}, {id: '2', name: 'Second'}], next: null}); });
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['First', 'Second']);
    expect(screen.getByText('First')).toBe(original);
    expect(screen.queryByRole('button', {name: 'Загрузить ещё'})).toBeNull();
    await act(async () => { calls[0].resolve({items: [{id: 'old', name: 'Stale strict effect'}], next: null}); });
    expect(screen.queryByText('Stale strict effect')).toBeNull();
  });

  test('filter replacement ignores old success/error and unmount aborts active work', async () => {
    const PagedUsers = component('Собеседования/Практика/React.md', 'react-load-more', 'PagedUsers');
    const calls: Array<ReturnType<typeof deferred> & {signal: AbortSignal}> = [];
    const loadPage = (_filter: unknown, _cursor: unknown, {signal}: {signal: AbortSignal}) => {
      const request = {...deferred(), signal}; calls.push(request); return request.promise;
    };
    const view = render(React.createElement(PagedUsers, {filter: 'a', loadPage}));
    view.rerender(React.createElement(PagedUsers, {filter: 'b', loadPage}));
    expect(calls[0].signal.aborted).toBe(true);
    await act(async () => { calls[1].resolve({items: [{id: 'b', name: 'Current'}], next: null}); });
    await act(async () => { calls[0].reject(new Error('old error')); });
    expect(screen.getByText('Current')).toBeTruthy(); expect(screen.queryByRole('alert')).toBeNull();
    view.rerender(React.createElement(PagedUsers, {filter: 'c', loadPage}));
    expect(screen.queryByText('Current')).toBeNull();
    view.unmount(); expect(calls[2].signal.aborted).toBe(true);
    await act(async () => { calls[2].resolve({items: [], next: null}); });
  });

  test('stable children skip wrapper update but parent update recreates the element', () => {
    const CompositionDemo = component('Фронтенд/React/12. Производительность.md', 'react-stable-children', 'CompositionDemo');
    const count = vi.spyOn(console, 'count').mockImplementation(() => {});
    render(React.createElement(CompositionDemo));
    const before = count.mock.calls.length;
    fireEvent.click(screen.getByRole('button', {name: 'Панель: 0'}));
    expect(screen.getByRole('button', {name: 'Панель: 1'})).toBeTruthy();
    expect(count.mock.calls.length).toBe(before);
    fireEvent.click(screen.getByRole('button', {name: 'Родитель: 0'}));
    expect(count.mock.calls.length).toBeGreaterThan(before);
  });

  test('Typography keeps semantic tag, children and native events without leaking as', () => {
    const Typography = component('Собеседования/Практика/React.md', 'react-typography', 'Typography');
    const onClick = vi.fn();
    const view = render(React.createElement(Typography, {as: 'a', href: '/articles', children: 'Статьи'}));
    expect(screen.getByRole('link').getAttribute('href')).toBe('/articles');
    expect(screen.getByRole('link').hasAttribute('as')).toBe(false);
    view.rerender(React.createElement(Typography, {as: 'button', type: 'button', onClick, children: 'Сохранить'}));
    fireEvent.click(screen.getByRole('button')); expect(onClick).toHaveBeenCalledOnce();
    view.rerender(React.createElement(Typography, {children: 'Текст'}));
    expect(screen.getByText('Текст').tagName).toBe('SPAN');
  });
});
