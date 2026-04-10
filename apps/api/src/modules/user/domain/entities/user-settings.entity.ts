import { ActiveRole, ResponseFormat } from '@nigar/shared-types';

export class UserSettings {
  readonly id: string;
  readonly userId: string;
  activeRole: ActiveRole;
  responseFormat: ResponseFormat;
  nigarBlackRudenessEnabled: boolean;
  language: string;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(params: {
    id: string;
    userId: string;
    activeRole?: ActiveRole;
    responseFormat?: ResponseFormat;
    nigarBlackRudenessEnabled?: boolean;
    language?: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = params.id;
    this.userId = params.userId;
    this.activeRole = params.activeRole ?? ActiveRole.NIGAR;
    this.responseFormat = params.responseFormat ?? ResponseFormat.TEXT;
    this.nigarBlackRudenessEnabled = params.nigarBlackRudenessEnabled ?? false;
    this.language = params.language ?? 'az';
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  updateSettings(data: {
    activeRole?: ActiveRole;
    responseFormat?: ResponseFormat;
    nigarBlackRudenessEnabled?: boolean;
    language?: string;
  }): void {
    if (data.activeRole !== undefined) this.activeRole = data.activeRole;
    if (data.responseFormat !== undefined) this.responseFormat = data.responseFormat;
    if (data.nigarBlackRudenessEnabled !== undefined)
      this.nigarBlackRudenessEnabled = data.nigarBlackRudenessEnabled;
    if (data.language !== undefined) this.language = data.language;
    this.updatedAt = new Date();
  }
}
