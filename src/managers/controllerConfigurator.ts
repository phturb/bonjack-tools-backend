import { Application } from "express";

export default interface ControllerConfigurator {
  configureController(app: Application): Application;
}
