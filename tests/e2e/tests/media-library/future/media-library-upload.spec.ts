import path from 'path';

import { test, expect } from '@playwright/test';

import { login } from '../../../../utils/login';
import { resetDatabaseAndImportDataFromPath } from '../../../../utils/dts-import';
import { describeOnCondition } from '../../../../utils/shared';

import { AssetsPage } from './page-objects/AssetsPage';

/**
 * Journey 1 — Upload my assets (CMS-1066).
 *
 * A content manager fills an empty library through every upload path. Broad and
 * shallow: chains every capability once in a single flow rather than isolating
 * each one, per the journey's own framing in CMS-1066.
 */

const UPLOADS_DIR = path.join(__dirname, '../../../data/uploads');
const IMAGE = path.join(UPLOADS_DIR, 'test-image.jpg');
const IMAGE_1 = path.join(UPLOADS_DIR, 'test-image-1.jpg');
const IMAGE_2 = path.join(UPLOADS_DIR, 'test-image-2.jpg');
const BLOCKED_FILE = path.join(UPLOADS_DIR, 'blocked-file.exe');

describeOnCondition(process.env.UNSTABLE_MEDIA_LIBRARY === 'true')(
  'Media Library - Journey 1: Upload my assets',
  () => {
    test.describe.configure({ timeout: 600_000 });

    test.beforeEach(async ({ page }) => {
      await resetDatabaseAndImportDataFromPath('with-admin');
      await page.goto('/admin');
      await login({ page });
    });

    test('a content manager can upload assets through every path', async ({ page }) => {
      const assetsPage = new AssetsPage(page);

      await test.step('I land on the Media Library and choose a view', async () => {
        await assetsPage.goto();

        await assetsPage.switchToGridView();
        expect(await assetsPage.isGridViewActive()).toBe(true);

        // the choice persists across reload                     [CMS-109/110/111]
        await page.reload();
        expect(await assetsPage.isGridViewActive()).toBe(true);

        await assetsPage.switchToTableView();
      });

      await test.step('I upload a single file via the file picker', async () => {
        await assetsPage.uploadFilesWithFilePicker(IMAGE);
        await expect(assetsPage.uploadProgressDialog).toBeVisible();
        await assetsPage.waitForUploadProgressSuccess();
        await assetsPage.closeUploadProgressDialog();

        await expect(assetsPage.getAssetRow('test-image')).toBeVisible();
      });

      await test.step('I upload multiple files and track per-file progress across navigation', async () => {
        await assetsPage.uploadFilesWithFilePicker([IMAGE_1, IMAGE_2]);
        await expect(assetsPage.uploadProgressDialog).toBeVisible();

        // the dialog persists while I navigate elsewhere in the admin  [CMS-107/1105]
        await page.goto('/admin');
        await expect(assetsPage.uploadProgressDialog).toBeVisible();

        await assetsPage.waitForUploadProgressSuccess();
        await expect(
          assetsPage.uploadProgressDialog.getByText('2 files uploaded successfully')
        ).toBeVisible();

        // progress is reported per file, not as one lump
        await expect(assetsPage.uploadProgressDialog.getByText('test-image-1.jpg')).toBeVisible();
        await expect(assetsPage.uploadProgressDialog.getByText('test-image-2.jpg')).toBeVisible();

        await assetsPage.closeUploadProgressDialog();
      });

      await test.step('I upload via drag and drop', async () => {
        await assetsPage.uploadFilesWithDragAndDrop(IMAGE);
        await expect(assetsPage.uploadProgressDialog).toBeVisible();
        await assetsPage.waitForUploadProgressSuccess();
        await assetsPage.closeUploadProgressDialog();
      });

      await test.step('I upload from a URL', async () => {
        await assetsPage.uploadFilesFromUrl('https://picsum.photos/200');
        await expect(assetsPage.uploadProgressDialog).toBeVisible();
        await assetsPage.waitForUploadProgressSuccess();
        await assetsPage.closeUploadProgressDialog();
      });

      await test.step('I cancel and retry an upload', async () => {
        // A batch large enough that at least some files are still in flight when
        // we click Cancel right after kicking the upload off (these fixtures are
        // tiny, so a single file would likely finish before we can catch it).
        const batch = Array(15).fill(IMAGE);

        await assetsPage.uploadFilesWithFilePicker(batch);
        await expect(assetsPage.uploadProgressDialog).toBeVisible();

        await assetsPage.cancelUpload();
        await expect(assetsPage.uploadProgressDialog.getByText('Upload canceled')).toBeVisible();

        await assetsPage.retryCancelledUploads();
        await assetsPage.waitForUploadProgressSuccess();
        await assetsPage.closeUploadProgressDialog();
      });

      await test.step('I am stopped from uploading unsupported types', async () => {
        // valid files in the same batch still upload                [CMS-249]
        await assetsPage.uploadFilesWithFilePicker([BLOCKED_FILE, IMAGE]);
        await expect(assetsPage.uploadProgressDialog).toBeVisible();
        await expect(
          assetsPage.uploadProgressDialog.getByText('1 uploaded, 1 failed')
        ).toBeVisible();
        await assetsPage.closeUploadProgressDialog();
      });

      await test.step('I bulk upload many files', async () => {
        // uploading > 20 files completes with no server crash        [CMS-358]
        const bigBatch = Array(25).fill(IMAGE);

        await assetsPage.uploadFilesWithFilePicker(bigBatch);
        await expect(assetsPage.uploadProgressDialog).toBeVisible();
        await assetsPage.waitForUploadProgressSuccess();
        await expect(
          assetsPage.uploadProgressDialog.getByText('25 files uploaded successfully')
        ).toBeVisible();
        await assetsPage.closeUploadProgressDialog();
      });

      // I upload files concurrently                                  [CMS-1111] (backlog)
      // Not shipped yet — nothing to assert until concurrency config lands.
    });
  }
);
