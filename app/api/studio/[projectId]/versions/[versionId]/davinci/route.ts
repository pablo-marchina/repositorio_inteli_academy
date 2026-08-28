export async function GET(request: Request, context: { params: Promise<{ projectId: string; versionId: string }> }) {
  const { projectId, versionId } = await context.params;
  const url = new URL(`/api/studio/${projectId}/versions/${versionId}/nle`, request.url);
  url.searchParams.set("target", "davinci");
  return Response.redirect(url, 307);
}
