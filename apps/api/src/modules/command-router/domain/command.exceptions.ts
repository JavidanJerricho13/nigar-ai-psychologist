export class UnknownCommandException extends Error {
  constructor(public readonly command: string) {
    super(`Naməlum əmr: ${command}`);
    this.name = 'UnknownCommandException';
  }
}

export class UserNotFoundForCommandException extends Error {
  constructor(
    public readonly userId: string,
    public readonly command: string,
  ) {
    super(`User "${userId}" not found while executing "${command}"`);
    this.name = 'UserNotFoundForCommandException';
  }
}
