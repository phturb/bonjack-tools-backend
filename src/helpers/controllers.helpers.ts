import cors from "cors";
import { Application } from "express";

const configureExpressApplication = (app: Application) => {
    app.use(cors());
    return app;
}

export default configureExpressApplication;
