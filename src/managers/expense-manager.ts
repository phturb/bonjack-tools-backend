import { PrismaClient } from "@prisma/client";
import { Application } from "express";
import Closeable from "./closeable";
import ControllerConfigurator from "./controller-configurator";
import Initializable from "./initializable";

export default class ExpenseManager implements Closeable, ControllerConfigurator, Initializable {
  
  private prismaClient: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient;
  };
  
  async init() {};

  configureController(app: Application): Application {
    return app;
  }

  close() {};
}
