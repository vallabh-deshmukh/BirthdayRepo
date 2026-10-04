# Birthday Cards

A static, shareable birthday-card site you can host on GitHub Pages. Someone fills in a name, age, and message, gets a link, and the birthday person blows out the candles (microphone or tap). After the candles go out, the message appears.

Card data lives in the URL hash, so there is no server, database, or paid URL. Links do not expire.

## Try it locally

Open `index.html` in a browser, or from this folder:

```bash
npx --yes serve .
```

Then visit the printed local URL.

## Publish on GitHub Pages

1. Create a GitHub repository and push this project.
2. In the repo: **Settings → Pages → Build and deployment**.
3. Set **Source** to **Deploy from a branch**.
4. Choose `main` and `/ (root)`, then save.
5. After a minute, the site is at `https://YOUR_USERNAME.github.io/REPO_NAME/`.

If the repo is named `YOUR_USERNAME.github.io`, the site is served from the domain root instead of a subfolder. Relative paths in this project work either way.

## How sharing works

Creating a card encodes name, age, message, and cake theme into the hash:

`https://YOUR_USERNAME.github.io/REPO_NAME/#c/<payload>`

Anyone with the link can open the cake. Nothing is stored on a server.
