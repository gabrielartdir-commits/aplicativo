import { getForecastProjection } from "@/services/actions/forecast.actions";

/** Fachada sobre a Server Action, no padrão dos outros repositórios. */
export const forecastRepository = {
  projection: getForecastProjection,
};
