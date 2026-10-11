# MicroSD Cloud Upload

A basic, password-protected upload portal for a folder on a mounted drive. It intentionally allows all file types, but it **never executes uploaded files** and downloads are sent as attachments.

## What it is (and is not)

- The application code can live on GitHub.
- Uploaded files live only at `STORAGE_PATH` on the microSD card; they are never committed to GitHub.
- Your Mac and card must remain powered on and connected for remote access to work.
- This app is not remotely available until you connect it through a secure service such as Cloudflare Tunnel or Tailscale.

## Run it on this Mac

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and replace `UPLOAD_PASSWORD` with a long unique password.
3. Load the environment and start it:

   ```sh
   set -a; source .env; set +a
   npm start
   ```

4. Open `http://localhost:3000`.

By default, files are stored in `/Volumes/MicroSD-128/MicroSD Cloud Uploads`.

## Share safely

Do not share a no-password upload link. Give trusted people the link and password separately, and use a secure tunnel with HTTPS before making it reachable over the internet. The default upload limit is 1 GB per file and 10 files per request; change `MAX_FILE_SIZE` if needed.

## Next steps

- Add Cloudflare Tunnel or Tailscale for remote access.
- Set up a launch agent so the server restarts after login or reboot.
- Add backups; microSD cards are not durable enough to be the only copy of important files.
