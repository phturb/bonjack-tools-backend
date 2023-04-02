export default interface Initializable {
  init(): Promise<void>;
}
