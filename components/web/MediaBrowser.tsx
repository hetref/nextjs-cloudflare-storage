"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ChevronRight,
    Folder,
    File as FileIcon,
    Loader2,
    RefreshCw,
    Trash2,
    Upload,
    ArrowUp,
    ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FolderEntry = {
    name: string;
    prefix: string;
};

type FileEntry = {
    key: string;
    name: string;
    size: number;
    lastModified: string | null;
    eTag: string | null;
};

type ListingResponse = {
    prefix: string;
    folders: FolderEntry[];
    files: FileEntry[];
    isTruncated: boolean;
    nextContinuationToken: string | null;
};

const LIST_PAGE_SIZE = 50;
const SIGNED_URL_BATCH_SIZE = 100;

function sortFolders(entries: FolderEntry[]) {
    return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

function sortFiles(entries: FileEntry[]) {
    return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

function bytesToReadableSize(value: number) {
    if (value === 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const size = value / 1024 ** exponent;

    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function toDisplayDate(value: string | null) {
    if (!value) {
        return "-";
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function prefixToSegments(prefix: string) {
    return prefix.split("/").filter(Boolean);
}

function segmentsToPrefix(segments: string[]) {
    if (!segments.length) {
        return "";
    }

    return `${segments.join("/")}/`;
}

export function MediaBrowser() {
    const [currentPrefix, setCurrentPrefix] = useState("");
    const [folders, setFolders] = useState<FolderEntry[]>([]);
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [nextContinuationToken, setNextContinuationToken] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [updatingKey, setUpdatingKey] = useState<string | null>(null);
    const [replaceTargetKey, setReplaceTargetKey] = useState<string | null>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);

    const hasMore = Boolean(nextContinuationToken);

    const requestListing = useCallback(
        async (prefix: string, continuationToken?: string) => {
            const params = new URLSearchParams({
                prefix,
                maxKeys: String(LIST_PAGE_SIZE),
            });

            if (continuationToken) {
                params.set("continuationToken", continuationToken);
            }

            const response = await fetch(`/api/s3/list?${params.toString()}`);

            if (!response.ok) {
                throw new Error("Could not load bucket listing.");
            }

            return (await response.json()) as ListingResponse;
        },
        []
    );

    const hydrateSignedUrls = useCallback(async (keys: string[]) => {
        if (!keys.length) {
            return;
        }

        for (let start = 0; start < keys.length; start += SIGNED_URL_BATCH_SIZE) {
            const chunk = keys.slice(start, start + SIGNED_URL_BATCH_SIZE);
            const response = await fetch("/api/s3/presigned-urls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keys: chunk, expiresIn: 300 }),
            });

            if (!response.ok) {
                throw new Error("Could not generate preview URLs.");
            }

            const data = (await response.json()) as { urls: Array<{ key: string; url: string }> };

            setSignedUrls((prev) => {
                const updates = data.urls.reduce<Record<string, string>>((acc, entry) => {
                    acc[entry.key] = entry.url;
                    return acc;
                }, {});

                return { ...prev, ...updates };
            });
        }
    }, []);

    const loadFolder = useCallback(
        async (prefix: string, options?: { continuationToken?: string; append?: boolean }) => {
            const isAppend = Boolean(options?.append);
            const continuationToken = options?.continuationToken;

            if (isAppend) {
                setIsLoadingMore(true);
            } else {
                setIsLoading(true);
            }

            try {
                const data = await requestListing(prefix, continuationToken);

                const sortedFolders = sortFolders(data.folders);
                const sortedFiles = sortFiles(data.files);

                setCurrentPrefix(data.prefix);
                setNextContinuationToken(data.nextContinuationToken);

                if (isAppend) {
                    setFolders((prev) => {
                        const map = new Map(prev.map((entry) => [entry.prefix, entry]));
                        sortedFolders.forEach((entry) => map.set(entry.prefix, entry));
                        return sortFolders(Array.from(map.values()));
                    });

                    setFiles((prev) => {
                        const map = new Map(prev.map((entry) => [entry.key, entry]));
                        sortedFiles.forEach((entry) => map.set(entry.key, entry));
                        return sortFiles(Array.from(map.values()));
                    });

                    await hydrateSignedUrls(sortedFiles.map((file) => file.key));
                } else {
                    setFolders(sortedFolders);
                    setFiles(sortedFiles);
                    setSignedUrls({});
                    await hydrateSignedUrls(sortedFiles.map((file) => file.key));
                }
            } finally {
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        },
        [hydrateSignedUrls, requestListing]
    );

    const refreshCurrentFolder = useCallback(async () => {
        setIsRefreshing(true);

        try {
            await loadFolder(currentPrefix);
        } catch {
            toast.error("Failed to refresh media list.");
        } finally {
            setIsRefreshing(false);
        }
    }, [currentPrefix, loadFolder]);

    useEffect(() => {
        loadFolder("").catch(() => {
            toast.error("Failed to load media list.");
            setIsLoading(false);
        });
    }, [loadFolder]);

    const breadcrumbItems = useMemo(() => {
        const segments = prefixToSegments(currentPrefix);

        const items = [{ label: "root", prefix: "" }];

        segments.forEach((segment, index) => {
            items.push({
                label: segment,
                prefix: segmentsToPrefix(segments.slice(0, index + 1)),
            });
        });

        return items;
    }, [currentPrefix]);

    const canGoUp = breadcrumbItems.length > 1;

    const goUpOneLevel = useCallback(async () => {
        const segments = prefixToSegments(currentPrefix);

        if (!segments.length) {
            return;
        }

        const nextPrefix = segmentsToPrefix(segments.slice(0, -1));

        try {
            await loadFolder(nextPrefix);
        } catch {
            toast.error("Failed to navigate to parent folder.");
        }
    }, [currentPrefix, loadFolder]);

    const onDelete = useCallback(
        async (key: string) => {
            setDeletingKey(key);

            try {
                const response = await fetch("/api/s3/delete", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key }),
                });

                if (!response.ok) {
                    throw new Error("Could not delete file.");
                }

                setFiles((prev) => prev.filter((entry) => entry.key !== key));
                setSignedUrls((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });

                toast.success("Media deleted successfully.");
            } catch {
                toast.error("Failed to delete media.");
            } finally {
                setDeletingKey(null);
            }
        },
        []
    );

    const triggerReplace = useCallback((key: string) => {
        setReplaceTargetKey(key);

        if (replaceInputRef.current) {
            replaceInputRef.current.value = "";
            replaceInputRef.current.click();
        }
    }, []);

    const onPickReplaceFile = useCallback(
        async (event: ChangeEvent<HTMLInputElement>) => {
            const pickedFile = event.target.files?.[0];

            if (!replaceTargetKey || !pickedFile) {
                return;
            }

            setUpdatingKey(replaceTargetKey);

            try {
                const response = await fetch("/api/s3/update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        key: replaceTargetKey,
                        contentType: pickedFile.type || "application/octet-stream",
                        size: pickedFile.size,
                    }),
                });

                if (!response.ok) {
                    throw new Error("Could not generate update URL.");
                }

                const data = (await response.json()) as { presignedUrl: string };

                const uploadResponse = await fetch(data.presignedUrl, {
                    method: "PUT",
                    headers: {
                        "Content-Type": pickedFile.type || "application/octet-stream",
                    },
                    body: pickedFile,
                });

                if (!uploadResponse.ok) {
                    throw new Error("Could not upload updated file.");
                }

                toast.success("Media updated successfully.");
                await loadFolder(currentPrefix);
            } catch {
                toast.error("Failed to update media.");
            } finally {
                setUpdatingKey(null);
                setReplaceTargetKey(null);
            }
        },
        [currentPrefix, loadFolder, replaceTargetKey]
    );

    return (
        <Card className="w-full mt-8">
            <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <CardTitle>Bucket Media Explorer</CardTitle>
                        <CardDescription>
                            Browse folders and files, then update or delete media with signed URLs.
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refreshCurrentFolder}
                        disabled={isRefreshing || isLoading}
                    >
                        {isRefreshing ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <RefreshCw className="size-4" />
                        )}
                        Refresh
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {breadcrumbItems.map((item, index) => {
                        const isLast = index === breadcrumbItems.length - 1;

                        return (
                            <div key={item.prefix || "root"} className="flex items-center gap-2">
                                <Button
                                    variant={isLast ? "secondary" : "ghost"}
                                    size="sm"
                                    disabled={isLast || isLoading}
                                    onClick={() => loadFolder(item.prefix).catch(() => toast.error("Failed to open folder."))}
                                >
                                    {item.label}
                                </Button>
                                {!isLast && <ChevronRight className="size-4 text-muted-foreground" />}
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goUpOneLevel}
                        disabled={!canGoUp || isLoading}
                    >
                        <ArrowUp className="size-4" />
                        Go up
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        Current: {currentPrefix || "/"}
                    </span>
                </div>
            </CardHeader>

            <CardContent>
                <input
                    ref={replaceInputRef}
                    type="file"
                    className="hidden"
                    onChange={onPickReplaceFile}
                />

                {isLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin mr-2" />
                        Loading media...
                    </div>
                ) : (
                    <div className="space-y-3">
                        {folders.length === 0 && files.length === 0 && (
                            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
                                No media found in this folder.
                            </div>
                        )}

                        {folders.map((folder) => (
                            <button
                                key={folder.prefix}
                                type="button"
                                className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent transition-colors"
                                onClick={() =>
                                    loadFolder(folder.prefix).catch(() => toast.error("Failed to open folder."))
                                }
                            >
                                <span className="inline-flex items-center gap-2 font-medium">
                                    <Folder className="size-4" />
                                    {folder.name}/
                                </span>
                            </button>
                        ))}

                        {files.map((file) => {
                            const previewUrl = signedUrls[file.key];
                            const isDeleting = deletingKey === file.key;
                            const isUpdating = updatingKey === file.key;

                            return (
                                <div
                                    key={file.key}
                                    className="rounded-md border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium flex items-center gap-2">
                                            <FileIcon className="size-4" />
                                            <span className="truncate">{file.name}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {bytesToReadableSize(file.size)} • {toDisplayDate(file.lastModified)}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!previewUrl}
                                            asChild
                                        >
                                            <a href={previewUrl} target="_blank" rel="noreferrer">
                                                <ExternalLink className="size-4" />
                                                Open
                                            </a>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => triggerReplace(file.key)}
                                            disabled={isUpdating || isDeleting}
                                        >
                                            {isUpdating ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                <Upload className="size-4" />
                                            )}
                                            Update
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => onDelete(file.key)}
                                            disabled={isDeleting || isUpdating}
                                        >
                                            {isDeleting ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="size-4" />
                                            )}
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}

                        {hasMore && (
                            <div className="pt-2">
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() =>
                                        loadFolder(currentPrefix, {
                                            continuationToken: nextContinuationToken ?? undefined,
                                            append: true,
                                        }).catch(() => toast.error("Failed to load more files."))
                                    }
                                    disabled={isLoadingMore}
                                >
                                    {isLoadingMore ? (
                                        <>
                                            <Loader2 className="size-4 animate-spin" />
                                            Loading more...
                                        </>
                                    ) : (
                                        "Load more"
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
