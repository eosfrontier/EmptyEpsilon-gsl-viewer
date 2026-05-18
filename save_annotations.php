<?php
header('Content-Type: application/json');

$response = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['data'])) {
        $jsonData = $_POST['data'];
        $file = 'annotations.json';

        // Validate if it's valid JSON before writing
        json_decode($jsonData);
        if (json_last_error() === JSON_ERROR_NONE) {
            if (file_put_contents($file, $jsonData) !== false) {
                $response['status'] = 'success';
                $response['message'] = 'Annotations saved successfully.';
            } else {
                $response['status'] = 'error';
                $response['message'] = 'Failed to write to file on server.';
            }
        } else {
            $response['status'] = 'error';
            $response['message'] = 'Invalid JSON data received.';
        }
    } else {
        $response['status'] = 'error';
        $response['message'] = 'No data received.';
    }
} else {
    $response['status'] = 'error';
    $response['message'] = 'Invalid request method.';
}

echo json_encode($response);
?>