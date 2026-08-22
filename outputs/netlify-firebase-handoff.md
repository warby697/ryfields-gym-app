# Ryfields Gym: final Netlify connection

The application now follows the same deployment pattern as Squadron Ops: Netlify hosts the Vite PWA and protected Netlify Functions; Firebase provides Authentication and Firestore.

## Before running the deployment helper

1. In Firebase, open **Project settings > Service accounts**.
2. Select **Generate new private key**, confirm, and save the downloaded JSON somewhere private.
3. In Firebase Authentication, create the first user with the email address that should be the Ryfields administrator.
4. Do not add this JSON file to the Ryfields folder, cloud storage, email, or source control.

## Run the prepared deployment

Open the `deployment` folder and run `4-SETUP-AND-DEPLOY-NETLIFY.cmd`.

The helper signs into Netlify, links or creates the site, validates the Firebase service account, stores the required values in Netlify, builds the project and deploys production. GoCardless remains disabled.

After deployment, sign in to the published Ryfields site with the administrator account. The authenticated one-time bootstrap assigns the admin role and creates the initial membership types.

## Security notes

- The Firebase web values beginning `VITE_` are public project identifiers; Firestore rules enforce access.
- The Firebase Admin private key is server-only and is stored as a protected Netlify environment variable.
- No payment or bank details are stored by Ryfields.
- GoCardless functions are not exported or deployed until valid credentials are available.
