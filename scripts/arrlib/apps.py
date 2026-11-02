"""App profile for whisparr.py. Copied from the nas repo's arrlib on 2026-11-02 and narrowed to Whisparr v3;
facts in wiki/integrations/whisparr-instance.md."""
from dataclasses import dataclass

# Config sections read by `config` and `snapshot`. An endpoint an app lacks answers 404 and
# is reported as n/a, so listing a superset is harmless.
_MEDIA = (
    "config/host", "config/ui", "config/naming", "config/mediamanagement",
    "config/downloadclient", "config/indexer", "config/importlist",
    "qualityprofile", "qualitydefinition", "customformat", "delayprofile", "releaseprofile",
    "rootfolder", "remotepathmapping", "downloadclient", "indexer", "importlist",
    "notification", "metadata", "tag", "autotagging",
)


@dataclass(frozen=True)
class App:
    name: str
    api: str             # API version segment: v3 or v1
    port: int            # default port on the NAS (host network)
    media: bool          # has queue / wanted / media library
    queue_include: tuple  # extra include* flags for GET queue
    sections: tuple

    @property
    def env(self):
        return self.name.upper()


APPS = {a.name: a for a in (
    App("whisparr3", "v3", 6970, True, ("includeUnknownMovieItems", "includeMovie"), _MEDIA),  # v3 "Eros", Radarr-based
)}
