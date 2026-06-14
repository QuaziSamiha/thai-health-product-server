import { Response } from 'express';
import { IApiResponse } from '../interfaces/send-response.interface';

export const sendResponse = <T>(res: Response, data: IApiResponse<T>): void => {
  const responseData: IApiResponse<T> = {
    statusCode: data.statusCode,
    success: data.success,
    message: data.message || 'Success',
    data: data.data,
    meta: data.meta,
  };

  res.status(data.statusCode).json(responseData);
};
