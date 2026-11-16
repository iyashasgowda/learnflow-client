import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, jsonResponse, renderSignedIn, stubApi } from './testUtils';
import { FakeXhr, installFakeXhr, makeFile, makeMaterial, materialList, MAX_UPLOAD_BYTES } from './fakeXhr';

const user = userEvent.setup({ applyAccept: false });

beforeEach(() => {
  installFakeXhr();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const choose = async (...files: File[]) => {
  await screen.findByRole('button', { name: 'Choose files' });
  await user.upload(screen.getByLabelText('Choose files to upload'), files);
};

const dropzone = () => screen.getByText('Drag and drop files here').closest('.dropzone') as HTMLElement;
const drop = (...files: File[]) => fireEvent.drop(dropzone(), { dataTransfer: { files, types: ['Files'] } });
const uploads = () => screen.getByRole('list', { name: 'Uploads' });
const latest = () => FakeXhr.instances[FakeXhr.instances.length - 1]!;

const withList = (items = [makeMaterial()]) => {
  let current = items;
  const api = stubApi({ 'GET /api/materials': () => jsonResponse(materialList(current)) });
  return { api, setItems: (next: typeof items) => (current = next) };
};

describe('Materials page states', () => {
  it('shows a loading message and then the empty state with the dropzone', async () => {
    stubApi();
    await renderSignedIn('/materials');
    expect(await screen.findByText(/You have no materials yet/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Materials' })).toBeInTheDocument();
    expect(screen.getByText('Supported formats: .txt, .md, .pdf, .docx. Up to 50 MB each.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeInTheDocument();
  });

  it('uses the limit reported by the server', async () => {
    stubApi({ 'GET /api/materials': () => jsonResponse(materialList([], 5 * 1024 * 1024)) });
    await renderSignedIn('/materials');
    expect(await screen.findByText(/Up to 5 MB each/)).toBeInTheDocument();
  });

  it('shows an error with a retry that loads the list', async () => {
    let fail = true;
    stubApi({ 'GET /api/materials': () => (fail ? errorResponse('INTERNAL', 'Could not load materials.', 500) : jsonResponse(materialList([makeMaterial()]))) });
    await renderSignedIn('/materials');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load materials.');
    expect(screen.queryByRole('button', { name: 'Choose files' })).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeInTheDocument();
  });

  it('lists ready, failed, and truncated materials with their details', async () => {
    withList([
      makeMaterial({ id: 'm1', name: 'Biology.docx', fileType: 'docx', sizeBytes: 3 * 1024 * 1024, charCount: 12345 }),
      makeMaterial({ id: 'm2', name: 'scan.pdf', fileType: 'pdf', status: 'failed', failureReason: 'This PDF appears to be scanned. OCR is not supported.', charCount: 0 }),
      makeMaterial({ id: 'm3', name: 'huge.txt', truncated: true, charCount: 2_000_000 }),
    ]);
    await renderSignedIn('/materials');
    const biology = (await screen.findByText('Biology.docx')).closest('li')!;
    expect(within(biology).getByText('Ready')).toBeInTheDocument();
    expect(within(biology).getByText('DOCX')).toBeInTheDocument();
    expect(within(biology).getByText('3 MB')).toBeInTheDocument();
    expect(within(biology).getByText('12,345 characters')).toBeInTheDocument();

    const scan = screen.getByText('scan.pdf').closest('li')!;
    expect(within(scan).getByText('Failed')).toBeInTheDocument();
    expect(within(scan).getByText(/OCR is not supported/)).toBeInTheDocument();
    expect(within(scan).queryByText(/characters/)).not.toBeInTheDocument();

    const huge = screen.getByText('huge.txt').closest('li')!;
    expect(within(huge).getByText(/only the first 2,000,000 characters were kept/)).toBeInTheDocument();
  });

  it('shows a processing material', async () => {
    withList([makeMaterial({ status: 'processing', charCount: 0 })]);
    await renderSignedIn('/materials');
    expect(await screen.findByText('Processing')).toBeInTheDocument();
  });
});

describe('checking files before sending', () => {
  it('blocks an unsupported type with a message and sends nothing', async () => {
    stubApi();
    await renderSignedIn('/materials');
    await choose(makeFile('virus.exe'));
    expect(within(uploads()).getByText(/This file type is not supported/)).toBeInTheDocument();
    expect(within(uploads()).getByText(/Supported formats: .txt, .md, .pdf, .docx/)).toBeInTheDocument();
    expect(FakeXhr.instances).toHaveLength(0);
    expect(within(uploads()).queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });

  it('blocks an empty file', async () => {
    stubApi();
    await renderSignedIn('/materials');
    await choose(makeFile('empty.txt', 0));
    expect(within(uploads()).getByText(/This file is empty/)).toBeInTheDocument();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('blocks a file over the limit and states the limit', async () => {
    stubApi({ 'GET /api/materials': () => jsonResponse(materialList([], 1024)) });
    await renderSignedIn('/materials');
    await choose(makeFile('big.pdf', 2048));
    expect(within(uploads()).getByText(/This file is larger than the 1 KB limit\./)).toBeInTheDocument();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('checks the real default limit of 50 MB', async () => {
    stubApi();
    await renderSignedIn('/materials');
    await choose(makeFile('big.pdf', MAX_UPLOAD_BYTES + 1));
    expect(within(uploads()).getByText(/This file is larger than the 50 MB limit\./)).toBeInTheDocument();
  });

  it('lets valid files through while reporting the invalid ones', async () => {
    stubApi();
    await renderSignedIn('/materials');
    await choose(makeFile('good.txt'), makeFile('bad.exe'));
    expect(FakeXhr.instances).toHaveLength(1);
    expect(latest().file.name).toBe('good.txt');
    expect(within(uploads()).getByText(/bad.exe/)).toBeInTheDocument();
  });

  it('lets a dismissed message go away', async () => {
    stubApi();
    await renderSignedIn('/materials');
    await choose(makeFile('virus.exe'));
    await user.click(within(uploads()).getByRole('button', { name: 'Dismiss: virus.exe' }));
    expect(screen.queryByRole('list', { name: 'Uploads' })).not.toBeInTheDocument();
  });
});

describe('uploading', () => {
  it('sends the file with the CSRF header and walks through uploading, reading, and ready', async () => {
    const { api, setItems } = withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt', 'some study notes'));

    const xhr = latest();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/materials');
    expect(xhr.headers['X-Requested-With']).toBe('LearnFlow');
    expect(xhr.file.name).toBe('notes.txt');
    expect(within(uploads()).getByText(/Uploading…/)).toBeInTheDocument();

    xhr.progress(25, 100);
    expect(within(uploads()).getByRole('progressbar', { name: 'Uploading notes.txt' })).toHaveAttribute('value', '25');
    expect(within(uploads()).getByText(/Uploading… 25%/)).toBeInTheDocument();

    xhr.sent();
    expect(within(uploads()).getByText(/Reading the document…/)).toBeInTheDocument();
    expect(within(uploads()).getByRole('progressbar', { name: 'Reading notes.txt' })).toBeInTheDocument();
    expect(within(uploads()).queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument();

    const created = makeMaterial({ id: 'new-1', name: 'notes.txt', charCount: 16 });
    setItems([created]);
    xhr.respond(201, created);
    expect(await within(uploads()).findByText(/Ready/)).toBeInTheDocument();
    expect(within(uploads()).getByText(/16 characters extracted\./)).toBeInTheDocument();
    expect(await screen.findByText('16 characters')).toBeInTheDocument();
    expect(api.callsTo('GET /api/materials').length).toBeGreaterThanOrEqual(2);
  });

  it('says so when a long document was cut', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('long.txt'));
    latest().sent();
    latest().respond(201, makeMaterial({ truncated: true, charCount: 2_000_000 }));
    expect(await within(uploads()).findByText(/only the first 2,000,000 characters were kept/)).toBeInTheDocument();
  });

  it('shows a document that was accepted but could not be read as failed, without a retry', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('scan.pdf'));
    latest().sent();
    latest().respond(201, makeMaterial({ name: 'scan.pdf', fileType: 'pdf', status: 'failed', failureReason: 'This PDF appears to be scanned. OCR is not supported.', charCount: 0 }));
    expect(await within(uploads()).findByText(/OCR is not supported/)).toBeInTheDocument();
    expect(within(uploads()).getByText(/Failed/)).toBeInTheDocument();
    expect(within(uploads()).queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });

  it('sends files one at a time, in order', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('first.txt', 'one'), makeFile('second.md', 'two'));
    expect(FakeXhr.instances).toHaveLength(1);
    expect(within(uploads()).getByText(/Waiting for its turn/)).toBeInTheDocument();

    latest().sent();
    latest().respond(201, makeMaterial({ name: 'first.txt' }));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    expect(latest().file.name).toBe('second.md');
  });

  it('accepts files dropped onto the dropzone', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await screen.findByRole('button', { name: 'Choose files' });
    drop(makeFile('dropped.md', '# hi'));
    expect(FakeXhr.instances).toHaveLength(1);
    expect(latest().file.name).toBe('dropped.md');
  });

  it('highlights the dropzone while files are dragged over it and ignores other drags', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await screen.findByRole('button', { name: 'Choose files' });
    fireEvent.dragEnter(dropzone(), { dataTransfer: { types: ['text/plain'] } });
    expect(dropzone()).not.toHaveClass('dropzone-active');
    fireEvent.dragEnter(dropzone(), { dataTransfer: { types: ['Files'] } });
    expect(dropzone()).toHaveClass('dropzone-active');
    fireEvent.dragLeave(dropzone(), { relatedTarget: document.body });
    expect(dropzone()).not.toHaveClass('dropzone-active');

    fireEvent.drop(dropzone(), { dataTransfer: { files: [makeFile('ignored.txt')], types: ['text/plain'] } });
    fireEvent.drop(dropzone(), { dataTransfer: { files: [], types: ['Files'] } });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('keeps the highlight while the pointer moves between the dropzone\'s own children', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await screen.findByRole('button', { name: 'Choose files' });
    fireEvent.dragOver(dropzone(), { dataTransfer: { types: ['Files'] } });
    const leave = createEvent.dragLeave(dropzone());
    Object.defineProperty(leave, 'relatedTarget', { value: screen.getByRole('button', { name: 'Choose files' }) });
    fireEvent(dropzone(), leave);
    expect(dropzone()).toHaveClass('dropzone-active');
  });

  it('lets the same file be chosen again after it finished', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('again.txt'));
    latest().sent();
    latest().respond(201, makeMaterial({ name: 'again.txt' }));
    await within(uploads()).findByText(/Ready/);
    await choose(makeFile('again.txt'));
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it('opens the file picker from the button', async () => {
    withList([]);
    await renderSignedIn('/materials');
    const input = (await screen.findByLabelText('Choose files to upload')) as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: 'Choose files' }));
    expect(click).toHaveBeenCalled();
    expect(input).toHaveAttribute('accept', '.txt,.md,.pdf,.docx');
    expect(input).toHaveAttribute('multiple');
  });
});

describe('duplicate submissions', () => {
  it('sends one request when the same file is dropped twice during the upload', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await screen.findByRole('button', { name: 'Choose files' });
    drop(makeFile('same.txt', 'abc'));
    drop(makeFile('same.txt', 'abc'));
    expect(FakeXhr.instances).toHaveLength(1);
    expect(screen.getByText('same.txt is already being uploaded.')).toBeInTheDocument();
    expect(within(uploads()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('blocks the same file again while it is being read, and in the same drop', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await screen.findByRole('button', { name: 'Choose files' });
    drop(makeFile('same.txt', 'abc'), makeFile('same.txt', 'abc'), makeFile('other.txt', 'abc'));
    latest().sent();
    drop(makeFile('same.txt', 'abc'), makeFile('other.txt', 'abc'));
    expect(screen.getByText('same.txt, other.txt are already being uploaded.')).toBeInTheDocument();
    expect(FakeXhr.instances).toHaveLength(1);
    expect(within(uploads()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('treats a different file with the same name as a new upload', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await screen.findByRole('button', { name: 'Choose files' });
    drop(makeFile('same.txt', 'abc'));
    drop(makeFile('same.txt', 'a longer version'));
    expect(within(uploads()).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText(/already being uploaded/)).not.toBeInTheDocument();
  });
});

describe('failures and retry', () => {
  it('shows a failure with a retry when the connection drops, and retry sends the file again', async () => {
    const { setItems } = withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt', 'abc'));
    latest().progress(10, 100);
    latest().networkError();

    expect(await within(uploads()).findByText(/The connection was lost/)).toBeInTheDocument();
    expect(within(uploads()).getByText(/Failed/)).toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();

    await user.click(within(uploads()).getByRole('button', { name: 'Retry: notes.txt' }));
    expect(FakeXhr.instances).toHaveLength(2);
    expect(within(uploads()).queryByText(/The connection was lost/)).not.toBeInTheDocument();
    setItems([makeMaterial({ name: 'notes.txt' })]);
    latest().sent();
    latest().respond(201, makeMaterial({ name: 'notes.txt' }));
    expect(await within(uploads()).findByText(/Ready/)).toBeInTheDocument();
  });

  it('treats a timeout like a lost connection', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt'));
    latest().timeout();
    expect(await within(uploads()).findByRole('button', { name: 'Retry: notes.txt' })).toBeInTheDocument();
  });

  it('shows the server\'s reason for a rejected file and offers no retry', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt'));
    latest().sent();
    latest().respond(415, { code: 'UNSUPPORTED_MEDIA_TYPE', message: "The file's content does not match its extension. Supported formats: .txt, .md, .pdf, .docx." });
    expect(await within(uploads()).findByText(/content does not match its extension/)).toBeInTheDocument();
    expect(within(uploads()).queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expect(within(uploads()).getByRole('button', { name: 'Dismiss: notes.txt' })).toBeInTheDocument();
  });

  it('shows a 413 from the server', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt'));
    latest().respond(413, { code: 'PAYLOAD_TOO_LARGE', message: 'The file is larger than the 50 MB limit.' });
    expect(await within(uploads()).findByText('Failed The file is larger than the 50 MB limit.')).toBeInTheDocument();
  });

  it('offers a retry when another upload is still being processed', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt'));
    latest().respond(409, { code: 'UPLOAD_IN_PROGRESS', message: 'Another upload is still being processed. Wait for it to finish and try again.' });
    expect(await within(uploads()).findByText(/Another upload is still being processed/)).toBeInTheDocument();
    expect(within(uploads()).getByRole('button', { name: 'Retry: notes.txt' })).toBeInTheDocument();
  });

  it('offers a retry after a server error', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt'));
    latest().respond(500, { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
    expect(await within(uploads()).findByRole('button', { name: 'Retry: notes.txt' })).toBeInTheDocument();
  });

  it('shows a general message when the server answers with something unreadable', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt'));
    latest().respond(502, '<html>Bad gateway</html>');
    expect(await within(uploads()).findByText(/The server sent an unexpected response/)).toBeInTheDocument();
    expect(within(uploads()).getByRole('button', { name: 'Retry: notes.txt' })).toBeInTheDocument();
  });

  it('keeps the other files going when one fails', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('bad.txt', 'x'), makeFile('good.txt', 'yy'));
    latest().networkError();
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    latest().sent();
    latest().respond(201, makeMaterial({ name: 'good.txt' }));
    expect(await within(uploads()).findByText(/Ready/)).toBeInTheDocument();
    expect(within(uploads()).getByRole('button', { name: 'Retry: bad.txt' })).toBeInTheDocument();
  });

  it('sends the user to sign in again when the session ended during the upload', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('notes.txt'));
    latest().respond(401, { code: 'UNAUTHENTICATED', message: 'You need to sign in to do that.' });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('clears finished rows but not the ones in flight', async () => {
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('a.exe'), makeFile('b.exe'), makeFile('c.txt', 'in flight'));
    await user.click(screen.getByRole('button', { name: 'Clear finished' }));
    const rows = within(uploads()).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('c.txt');
    expect(within(rows[0]!).queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument();
  });
});

describe('deleting materials', () => {
  it('asks first and names the material before deleting anything', async () => {
    const api = stubApi({ 'GET /api/materials': () => jsonResponse(materialList([makeMaterial({ id: 'm1', name: 'old.txt' })])) });
    await renderSignedIn('/materials');
    await user.click(await screen.findByRole('button', { name: 'Delete: old.txt' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this material?' });
    expect(within(dialog).getByText(/“old.txt” and its extracted text will be permanently deleted/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(api.callsTo('DELETE /api/materials/m1')).toHaveLength(0);
  });

  it('deletes after confirmation, announces it, and the item leaves the list', async () => {
    let items = [makeMaterial({ id: 'm1', name: 'old.txt' })];
    const api = stubApi({
      'GET /api/materials': () => jsonResponse(materialList(items)),
      'DELETE /api/materials/m1': () => {
        items = [];
        return new Response(null, { status: 204 });
      },
    });
    await renderSignedIn('/materials');
    await user.click(await screen.findByRole('button', { name: 'Delete: old.txt' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete material' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/You have no materials yet/)).toBeInTheDocument();
    expect(screen.getByText('Deleted “old.txt”.')).toBeInTheDocument();
    expect(api.callsTo('DELETE /api/materials/m1')[0]?.headers.get('X-Requested-With')).toBe('LearnFlow');
  });

  it('does nothing on cancel and returns focus', async () => {
    const api = stubApi({ 'GET /api/materials': () => jsonResponse(materialList([makeMaterial({ id: 'm1', name: 'old.txt' })])) });
    await renderSignedIn('/materials');
    const trigger = await screen.findByRole('button', { name: 'Delete: old.txt' });
    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(api.callsTo('DELETE /api/materials/m1')).toHaveLength(0);
  });

  it('keeps the dialog open with a message when the delete fails', async () => {
    stubApi({
      'GET /api/materials': () => jsonResponse(materialList([makeMaterial({ id: 'm1', name: 'old.txt' })])),
      'DELETE /api/materials/m1': () => errorResponse('INTERNAL_ERROR', 'Could not delete the material.', 500),
    });
    await renderSignedIn('/materials');
    await user.click(await screen.findByRole('button', { name: 'Delete: old.txt' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete material' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not delete the material.');
    expect(screen.getByText('old.txt')).toBeInTheDocument();
  });
});

describe('browser storage', () => {
  it('never writes file contents or large strings to local or session storage', async () => {
    const marker = 'SECRET-STUDY-NOTES-'.repeat(50);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    withList([]);
    await renderSignedIn('/materials');
    await choose(makeFile('private.txt', marker));
    latest().progress(50, 100);
    latest().sent();
    latest().respond(201, makeMaterial({ name: 'private.txt' }));
    await within(uploads()).findByText(/Ready/);

    for (const [, value] of setItem.mock.calls) {
      expect(String(value)).not.toContain('SECRET-STUDY-NOTES');
      expect(String(value).length).toBeLessThan(200);
    }
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        expect(storage.getItem(storage.key(index)!) ?? '').not.toContain('private.txt');
      }
    }
    setItem.mockRestore();
  });
});
