# AutoLabel panel in CVAT

`docker-compose.yml` builds `Dockerfile.autolabel-ui` on top of the existing `cvat/ui` image. Nginx injects
`autolabel-panel.js` into CVAT's HTML. The script adds **AutoLabel video** to the annotation-page toolbar. Browser
requests use the same-origin `/autolabel/` route provided by `P-116/docker-compose.internal.yml`, forwarding the
CVAT session cookie and CSRF header. The service PAT stays in P-116. P-116 verifies the user's CVAT job permissions;
the CVAT server must be rebuilt to expose `/api/jobs/{id}/autolabel-permission`.

Start CVAT and the P-116 internal Compose overlay, then open a 2D job that starts at frame 0. The panel imports that job's frames, saves and captures
manual frame-0 boxes, runs AI labeling, displays the review queue, and adds pending tracks to the same CVAT job. The
importer accepts a continuous, unfiltered CVAT job and selects at most 300 model frames with either motion budget or
threshold sampling. It does not recover original video timestamps from CVAT; imported frames use one-second placeholder timestamps. Refresh the CVAT page after rebuilding
the UI image so the browser loads the updated script.

## Privacy-first VM backend

The panel checks `GET /autolabel/api/v1/vm/capabilities` before enabling actions.
When `enabled` is true, it offers a source-video file picker, 1–8 unique class names,
SAM3/SAM3.1 and the pipelines advertised by the backend. Hybrid pipelines use SAM3.
Upload uses `POST /autolabel/api/v1/vm/jobs` with multipart `video` and JSON `options`;
the browser supplies the multipart boundary and the panel forwards the CVAT CSRF token.
VLM is disabled for these uploads; configuring or running VLM remains a separate workflow.

The VM backend redacts the video and creates a **new** CVAT task/job. It does not import
or write annotations into the job from which the panel was opened. The panel shows
privacy, processing and publication frame counts, polls queued/running jobs, offers
cancel/retry, and links to the resulting annotation job. Save any current edits before
following that link. An uploaded job ID is retained in session storage per originating
CVAT job; on a result job, the panel can also discover the VM job through
`GET /vm/cvat-jobs/{cvat_job_id}`. Opening the panel restores tracking without re-uploading.

When capabilities reports `enabled: false`, or the capabilities endpoint returns 404,
the existing CVAT import panel is used. Other capability errors show a reconnect action
and do not enable import. VM mode does not use the legacy import, review or Claude routes.

After updating the source, rebuild/recreate the `cvat_ui` service using your deployment's
Compose files and refresh CVAT to load the injected script. This source change alone
does not update an already-built UI image.

Run the panel contract tests with `node cvat-ui/autolabel-panel.test.cjs`.
