# Budget Tools categorization scorer (.NET 8 + Microsoft.ML), run in warm HTTP `serve` mode.
#
# Trained models are NOT baked into this image. They are gitignored build artifacts, and Coolify
# builds from a git clone, so they would be missing anyway. Instead the container downloads them
# from S3 on startup (see Data/ModelDownloader.cs), driven by the ModelStorage__* env vars.
# Publish them with `pnpm upload:models`.
#
# Build context is the REPO ROOT (see docker-compose-prod.yml), not this directory.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

COPY apps/categorization-ai/YnabCategoryAi.csproj ./
RUN dotnet restore "YnabCategoryAi.csproj"

COPY apps/categorization-ai/ ./
RUN dotnet publish "YnabCategoryAi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# The aspnet image ships neither curl nor wget, and the compose healthcheck needs one to poll
# /health (which only reports ready once the scoring session is warm).
RUN apt-get update \
    && apt-get install --no-install-recommends -y curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

# Models land here at runtime, downloaded from S3 into the path MlSettings resolves
# (models/category-model.zip and siblings, relative to the working directory).
RUN mkdir -p ./models

ENV DOTNET_RUNNING_IN_CONTAINER=true
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 4021

# `serve` warms a ScoringSession once and holds it, instead of paying model-load cost per predict.
ENTRYPOINT ["dotnet", "YnabCategoryAi.dll", "serve"]
