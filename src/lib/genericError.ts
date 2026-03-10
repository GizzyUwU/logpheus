export function getGenericErrorMessage(
  status: number | null,
  prefix: string,
): string | null {
  switch (status) {
    case 401:
      return "Bad API Key! Run /" + prefix + "-config to fix!";
    case 408:
      return "Server timed out!";
    case 429:
      return "You hit the ratelimit! Wait a minute before running again.";
    case 500:
      return "Server is down!";
    case 502:
      return "Server is down!";
    case 503:
      return "Server is down!";
    case 504:
      return "Server is down!";
    default:
      return "Unexpected error has occurred!";
  }
}
