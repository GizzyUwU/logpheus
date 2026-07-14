export function getGenericErrorMessage(
  status: number | null,
  prefix: string,
): string | null {
  switch (status) {
    case 401:
      return "Bad API Key! Run /" + prefix + "-(ysws) config to fix!";
    case 408:
      return "Server timed out!";
    case 404:
      return "Not found"
    case 429:
      return "You hit the ratelimit! Wait a minute before running again!";
    case 500:
    case 501:
    case 502:
    case 503:
    case 504:
    case 505:
    case 506:
    case 507:
    case 508:
    case 510:
    case 511:
    case 520:
    case 521:
    case 522:
    case 523:
    case 524:
    case 525:
    case 526:
    case 527:
    case 530:
      return "Server is down!";
    default:
      return "Unexpected error has occurred!";
  }
}